/**
 * In-memory script execution.
 *
 * The point of this module: never materialize a sealed script as a file.
 * Node, Python and Bash all read a program from stdin, so the script text only
 * ever exists in the harness process and in the interpreter's own memory.
 * No temp directory, no filename for the agent to `read`, nothing left on disk
 * after the call.
 *
 * A program that consumes stdin cannot also receive data on it, so arguments
 * travel through argv (or through a file the caller names). Keep that contract
 * in mind when authoring sealed scripts: take a JSON argument, not a pipe.
 */
import { spawn } from 'node:child_process'

const DEFAULT_RUNTIMES = {
  node: process.execPath,
  python: 'python',
  bash: 'bash',
}

/**
 * Pick the interpreter command and the argv shape that makes it read the
 * program from stdin while still forwarding user arguments.
 * @param {string} lang
 * @param {Record<string,string>} [runtimes]
 * @returns {{command:string, args:string[]}}
 */
export function interpreterFor(lang, runtimes) {
  const table = { ...DEFAULT_RUNTIMES, ...(runtimes ?? {}) }
  switch (lang) {
    case 'node':
      // `node - a b`  ->  process.argv = [node, '-', 'a', 'b']
      return { command: table.node, args: ['-'] }
    case 'python':
      // `python - a b` -> sys.argv = ['-', 'a', 'b']
      return { command: table.python, args: ['-'] }
    case 'bash':
      // `bash -s -- a b` -> $1 = 'a'
      return { command: table.bash, args: ['-s', '--'] }
    default:
      throw new Error(`unsupported script language "${lang}"`)
  }
}

/**
 * Run one sealed script.
 * @param {object} job
 * @param {string} job.code script source
 * @param {string} job.lang node | python | bash
 * @param {string[]} [job.args]
 * @param {string} job.cwd
 * @param {NodeJS.ProcessEnv} [job.env]
 * @param {number} [job.timeoutMs]
 * @param {number} [job.maxOutputBytes]
 * @param {AbortSignal} [job.signal]
 * @param {Record<string,string>} [job.runtimes]
 * @returns {Promise<{exitCode:number|null, stdout:string, stderr:string, timedOut:boolean, truncated:boolean}>}
 */
export function runSealedScript(job) {
  const {
    code,
    lang,
    args = [],
    cwd,
    env,
    timeoutMs = 120_000,
    maxOutputBytes = 256 * 1024,
    signal,
    runtimes,
  } = job

  const { command, args: interpreterArgs } = interpreterFor(lang, runtimes)
  const argv = [...interpreterArgs, ...args]
  let child
  try {
    child = spawn(command, argv, {
      cwd,
      env: { ...process.env, ...(env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } catch (error) {
    return Promise.reject(
      new Error(
        `cannot start ${command}: ${error.code ?? error.message}. ` +
          'sealed_run needs a host that allows child processes with piped stdio; ' +
          'a restricted sandbox blocks named pipes entirely.',
      ),
    )
  }

  let stdout = ''
  let stderr = ''
  let truncated = false
  let timedOut = false

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8')
    if (stdout.length + text.length > maxOutputBytes) {
      truncated = true
      stdout += text.slice(0, Math.max(0, maxOutputBytes - stdout.length))
      return
    }
    stdout += text
  })
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8')
    if (stderr.length + text.length > maxOutputBytes) {
      truncated = true
      stderr += text.slice(0, Math.max(0, maxOutputBytes - stderr.length))
      return
    }
    stderr += text
  })

  const kill = () => {
    try {
      child.kill('SIGKILL')
    } catch {
      /* already gone */
    }
  }

  let timer
  const onAbort = () => {
    kill()
  }
  if (signal !== undefined) {
    if (signal.aborted) kill()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeoutMs)
    timer.unref?.()
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer)
      if (signal !== undefined) signal.removeEventListener('abort', onAbort)
    }
    child.on('error', (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`failed to start ${command}: ${error.message}`))
    })
    child.on('close', (exitCode) => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ exitCode, stdout, stderr, timedOut, truncated })
    })
    // The program arrives on stdin and EOF follows, so the interpreter exits
    // as soon as the program finishes.
    child.stdin.on('error', () => {
      /* the child may exit before consuming the program */
    })
    child.stdin.end(code)
  })
}
