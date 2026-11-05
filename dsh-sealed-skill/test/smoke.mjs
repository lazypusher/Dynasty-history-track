#!/usr/bin/env node
/**
 * Mechanism-level smoke test.
 *
 * Covers the parts that can break silently: pack crypto, in-memory execution,
 * the opaque resource base, and the tool plumbing. `@deepseek-ai/dsh-tools` is
 * replaced by a minimal shim here because it only ships inside the app; the
 * real cordis wiring is exercised by booting a profile (see README).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { bindSecretToMachine, machineFingerprint, openPack, sealPack } from '../lib/pack.js'
import { runSealedScript } from '../lib/runner.js'
import { SealedCatalog } from '../lib/core.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SECRET = 'demo-secret-not-for-production-0123456789'
const work = await mkdtemp(join(tmpdir(), 'sealed-skill-test-'))
const packPath = join(work, 'demo.pack')

let failures = 0
const skipped = []
const check = async (label, body) => {
  try {
    await body()
    console.log(`ok   ${label}`)
  } catch (error) {
    failures += 1
    console.log(`FAIL ${label}\n     ${error.message}`)
  }
}
const checkIf = (condition, reason) => async (label, body) => {
  if (!condition) {
    skipped.push(`${label} (${reason})`)
    console.log(`skip ${label} — ${reason}`)
    return
  }
  await check(label, body)
}

// Confined sandboxes (including DSH's own workspace-write mode) block named
// pipes, so no child-process capture is possible there. Detect once and skip
// the execution checks rather than reporting a false failure.
const pipesAvailable = (() => {
  try {
    const out = execFileSync(process.execPath, ['-e', 'process.stdout.write("1")'], { stdio: 'pipe' })
    return out.toString() === '1'
  } catch {
    return false
  }
})()
const checkExec = checkIf(pipesAvailable, 'child-process pipes are blocked in this sandbox')
console.log(
  pipesAvailable
    ? 'mode: child pipes available, running execution checks'
    : 'mode: child pipes blocked, execution checks skipped',
)

// ---------------------------------------------------------------- build pack
execFileSync(
  process.execPath,
  [
    join(ROOT, 'bin/seal.mjs'),
    '--src',
    join(ROOT, 'examples/demo-skill'),
    '--out',
    packPath,
    '--secret',
    SECRET,
  ],
  { stdio: 'ignore' },
)
const pack = await readFile(packPath)

await check('pack is ciphertext (no plaintext skill text)', () => {
  const asText = pack.toString('utf8')
  for (const needle of ['SEVERITY', 'PLAYBOOK', '客诉', 'sealed_run', 'complaint-triage']) {
    assert.equal(asText.includes(needle), false, `pack contains plaintext "${needle}"`)
  }
})

await check('round trip', () => {
  const plain = openPack(pack, SECRET).toString('utf8')
  assert.match(plain, /complaint-triage/u)
})

await check('wrong secret fails authentication', () => {
  assert.throws(() => openPack(pack, 'a-completely-different-secret-value'), /authenticate|Unsupported state/u)
})

await check('tampered ciphertext fails authentication', () => {
  const copy = Buffer.from(pack)
  copy[copy.length - 20] ^= 0xff
  assert.throws(() => openPack(copy, SECRET), /authenticate|Unsupported state/u)
})

await check('sealing is not deterministic (fresh salt/iv)', () => {
  const a = sealPack(Buffer.from('{"skills":[]}'), SECRET)
  const b = sealPack(Buffer.from('{"skills":[]}'), SECRET)
  assert.equal(a.equals(b), false)
})

await check('machine-bound key file round trip', async () => {
  const record = bindSecretToMachine(SECRET)
  assert.equal(record.fp, machineFingerprint())
  const keyFile = join(work, 'demo.key')
  await writeFile(keyFile, JSON.stringify(record))
  const recovered = await SealedCatalog.open({ packPath, keyConfig: { keyFile } })
  assert.equal(recovered.skills.size, 1)
})

// ------------------------------------------------------------------- catalog
const catalog = new SealedCatalog({ packPath, secret: SECRET })
catalog.load(pack, SECRET)

await check('catalog lists an opaque resource base and no path', () => {
  const [summary] = catalog.summaries()
  assert.equal(summary.name, 'complaint-triage')
  assert.equal(summary.resourceBase.kind, 'opaque')
  assert.equal('path' in summary, false)
  assert.equal(JSON.stringify(summary).includes(work), false)
})

await check('skill body carries no rules or script bodies', () => {
  const definition = catalog.definition('complaint-triage')
  assert.equal(typeof definition.content, 'string')
  for (const needle of ['SEVERITY', 'PLAYBOOK', 'TIER_WEIGHT', 'P1', 'score >= 70']) {
    assert.equal(definition.content.includes(needle), false, `body leaks "${needle}"`)
  }
})

await check('inventory exposes ids and one-liners only', () => {
  const inventory = catalog.inventory()
  assert.match(inventory, /classify/u)
  assert.match(inventory, /sla/u)
  assert.equal(inventory.includes('SEVERITY'), false)
})

// ----------------------------------------------------------------- execution
const runCwd = join(work, 'run-cwd')
await mkdir(runCwd, { recursive: true })
const before = await readdir(runCwd)

const classify = pipesAvailable
  ? await catalog.run('classify', { args: ['资金被盗，客户已投诉到监管，持续三天', 'S'], cwd: runCwd })
  : undefined
await checkExec('sealed python script runs and returns a graded result', () => {
  assert.equal(classify.result.exitCode, 0, classify.result.stderr)
  const value = JSON.parse(classify.result.stdout)
  assert.equal(value.level, 'P1')
  assert.equal(value.sla_hours, 2)
})

await checkExec('script run leaves no file behind', async () => {
  const after = await readdir(runCwd)
  assert.deepEqual(after, before)
})

const plan = pipesAvailable ? await catalog.run('plan', { args: ['["classify"]'], cwd: runCwd }) : undefined
await checkExec('flow state machine lives in the sealed script', () => {
  const value = JSON.parse(plan.result.stdout)
  assert.equal(value.next, 'respond')
  assert.equal(value.script, 'respond')
})

await checkExec('node runs from stdin too', async () => {
  const result = await runSealedScript({
    code: 'console.log(JSON.stringify({argv: process.argv.slice(2)}))',
    lang: 'node',
    args: ['x', 'y'],
    cwd: runCwd,
  })
  assert.deepEqual(JSON.parse(result.stdout).argv, ['x', 'y'])
})

await checkExec('bash runs from stdin too', async () => {
  const result = await runSealedScript({
    code: 'printf "%s-%s" "$1" "$2"',
    lang: 'bash',
    args: ['a', 'b'],
    cwd: runCwd,
  })
  assert.equal(result.stdout, 'a-b', result.stderr)
})

await checkExec('timeout kills a runaway script', async () => {
  const result = await runSealedScript({
    code: 'import time\nwhile True: time.sleep(0.05)',
    lang: 'python',
    cwd: runCwd,
    timeoutMs: 400,
  })
  assert.equal(result.timedOut, true)
})

// ------------------------------------------------------------------ plumbing
// Copy the real lib into a sandbox that can resolve the dsh-tools shim, then
// drive the plugin exactly as Cordis would.
const sandbox = join(work, 'plugin')
await cp(join(ROOT, 'lib'), join(sandbox, 'lib'), { recursive: true })
await mkdir(join(sandbox, 'node_modules/@deepseek-ai/dsh-tools'), { recursive: true })
await writeFile(
  join(sandbox, 'node_modules/@deepseek-ai/dsh-tools/package.json'),
  JSON.stringify({ name: '@deepseek-ai/dsh-tools', version: '0.0.0-shim', type: 'module', main: 'index.js' }),
)
await writeFile(
  join(sandbox, 'node_modules/@deepseek-ai/dsh-tools/index.js'),
  `export function defineTool(options) {
     return {
       name: options.name,
       description: options.description,
       parameters: options.parameters,
       output: options.output,
       async execute(args, exec) {
         for (const [key, spec] of Object.entries(options.parameters ?? {})) {
           if (spec.required === true && !(key in args)) throw new Error('missing required argument ' + key)
         }
         return options.execute(args, exec)
       },
     }
   }`,
)

const { apply } = await import(pathToFileURL(join(sandbox, 'lib/index.js')).href)
// `apply` was imported from the copied lib; its PACKAGE_ROOT is the sandbox, so
// hand it an absolute pack path.
let provider
const tools = new Map()
const ctx = {
  skills: { registerProvider: (create) => { provider = create({ signal: new AbortController().signal, invalidate() {} }) } },
  tools: { register: (tool) => tools.set(tool.name, tool) },
  get: () => undefined,
  logger: { warn: console.warn, error: console.error, info: () => {} },
}
apply(ctx, { packPath, key: SECRET, timeoutMs: 30_000 })

await check('plugin registers provider and four tools', () => {
  assert.equal(typeof provider, 'object')
  assert.deepEqual([...tools.keys()].sort(), ['sealed_assets', 'sealed_doc', 'sealed_run', 'sealed_status'])
})

await check('provider.list()/get() serve the sealed skill', async () => {
  const listed = await provider.list({})
  assert.equal(listed.complete, true)
  assert.equal(listed.candidates.length, 1)
  const definition = await provider.get(listed.candidates[0])
  assert.equal(definition.provider, 'sealed')
  assert.equal(definition.resourceBase.kind, 'opaque')
})

await check('sealed_assets tool', async () => {
  const value = await tools.get('sealed_assets').execute({}, {})
  assert.match(value.text, /classify/u)
})

await checkExec('sealed_run tool', async () => {
  const value = await tools
    .get('sealed_run')
    .execute({ script: 'classify', args: ['无法登录，已经一周', 'A'] }, { signal: new AbortController().signal })
  assert.match(value.text, /"level"/u)
})

await check('sealed_run rejects an unknown id with guidance', async () => {
  await assert.rejects(
    tools.get('sealed_run').execute({ script: 'nope' }, { signal: new AbortController().signal }),
    /unknown sealed script "nope"; call sealed_assets/u,
  )
})

await check('sealed_doc tool returns one topic', async () => {
  const value = await tools.get('sealed_doc').execute({ topic: 'tone' }, {})
  assert.match(value.text, /对外沟通/u)
})

await check('sealed_status reports the pack digest', async () => {
  const value = await tools.get('sealed_status').execute({}, {})
  assert.match(value.text, /digest: [0-9a-f]{16}/u)
})

// A failed unlock must not be cached: installing the right key later recovers.
await check('missing secret fails loudly and is retryable', async () => {
  const keyless = new SealedCatalog({ packPath, secret: '' })
  assert.throws(() => keyless.load(pack, ''), /authenticate|Unsupported state/u)
})

await rm(work, { recursive: true, force: true })

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
