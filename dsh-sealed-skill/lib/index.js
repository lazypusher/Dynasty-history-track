/**
 * `skill-sealed` — serve a product's skills from an encrypted pack instead of
 * a plaintext skill directory.
 *
 * What changes for the model compared with `@deepseek-ai/dsh-skill-filesystem`:
 *   - the skill body is decrypted in memory, so no SKILL.md exists on disk;
 *   - `resourceBase` is `opaque`: the model is never told a directory it could
 *     `read` or `ls`, so scripts and references are unreachable by path;
 *   - scripts run through `sealed_run`, which pipes them to an interpreter over
 *     stdin and never writes them to a temporary file;
 *   - references are fetched per topic through `sealed_doc`, so one turn only
 *     ever sees the fragment it asked for.
 *
 * Wire it into a profile with a bundle patch (see cordis.patch.yml).
 */
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { SealedCatalog } from './core.js'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Cordis plugin name. */
export const name = 'skill-sealed'

/** Services this plugin mounts against. */
export const inject = ['skills', 'tools']

const TEXT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { text: { type: 'string', required: true } },
  },
  render: (_args, value) => [{ type: 'text', text: value.text }],
}

/** Resolve a configured path against the package root, leaving absolute paths alone. */
function packagePath(path) {
  return isAbsolute(path) ? path : resolve(PACKAGE_ROOT, path)
}

/**
 * Mount the sealed provider and its tools.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} [config]
 * @param {string} [config.packPath] encrypted pack, relative to the package root
 * @param {string} [config.key] dev-only secret; prefer DSH_SEAL_KEY or keyFile
 * @param {string} [config.keyFile] machine-bound key file
 * @param {string} [config.providerName] skill provider name shown to the model
 * @param {string} [config.source] skill source label
 * @param {number} [config.rank] precedence rank; 600 outranks every filesystem root
 * @param {number} [config.timeoutMs] per-script wall clock
 * @param {string} [config.resourceHint] opaque resource description for the model
 * @param {Record<string,string>} [config.runtimes] interpreter overrides (node/python/bash)
 */
export function apply(ctx, config = {}) {
  const packPath = packagePath(config.packPath ?? 'assets/product.pack')
  const keyFile = config.keyFile === undefined ? undefined : packagePath(config.keyFile)

  let opening
  const catalog = () => {
    opening ??= SealedCatalog.open({
      packPath,
      keyConfig: {
        ...(config.key === undefined ? {} : { key: config.key }),
        ...(keyFile === undefined ? {} : { keyFile }),
      },
      ...(config.providerName === undefined ? {} : { providerName: config.providerName }),
      ...(config.source === undefined ? {} : { source: config.source }),
      ...(config.rank === undefined ? {} : { rank: config.rank }),
      ...(config.runtimes === undefined ? {} : { runtimes: config.runtimes }),
      ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
      ...(config.resourceHint === undefined ? {} : { resourceHint: config.resourceHint }),
    }).catch((error) => {
      // Do not cache a failed open: a key file installed later should recover
      // without a restart.
      opening = undefined
      throw error
    })
    return opening
  }

  // --- skill provider -----------------------------------------------------
  const providerName = config.providerName ?? 'sealed'
  ctx.skills.registerProvider(() => ({
    name: providerName,
    async list() {
      const sealed = await catalog()
      return { candidates: sealed.summaries(), complete: true }
    },
    async get(candidate) {
      const sealed = await catalog()
      return sealed.definition(candidate.name)
    },
  }))

  // --- working directory --------------------------------------------------
  const cwdFor = async (exec) => {
    const workingDirectory = ctx.get('workingDirectory')
    if (workingDirectory !== undefined && exec.agent !== undefined) {
      try {
        return await workingDirectory.ensure(exec.agent, exec.signal)
      } catch {
        /* fall back to the process cwd */
      }
    }
    return process.cwd()
  }

  // --- tools --------------------------------------------------------------
  ctx.tools.register(
    defineTool({
      name: 'sealed_assets',
      description:
        'List the sealed resources available for a product skill: script ids you can pass to sealed_run and topic ids you can pass to sealed_doc. Call this before using either tool.',
      parameters: {
        skill: {
          type: 'string',
          description: 'Skill name to scope the listing to. Omit to list every skill in this pack.',
        },
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const sealed = await catalog()
        return { text: sealed.inventory(args.skill) }
      },
      presentCall: (args) => ({
        card: 'generic',
        title: `List sealed resources${args.skill === undefined ? '' : ` for ${args.skill}`}`,
        kind: 'read',
        rawInput: args.skill ?? '',
      }),
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'sealed_run',
      description:
        'Run one sealed script from this product skill and return its output. Pass arguments as separate argv strings; the script reads its input from argv or from files it is told about, never from stdin.',
      parameters: {
        script: { type: 'string', required: true, description: 'Script id from sealed_assets.' },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Arguments forwarded to the script as argv entries.',
        },
        skill: {
          type: 'string',
          description: 'Skill name that owns the script, when two skills reuse an id.',
        },
      },
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        const sealed = await catalog()
        const cwd = await cwdFor(exec)
        const outcome = await sealed.run(args.script, {
          args: args.args ?? [],
          ...(args.skill === undefined ? {} : { skill: args.skill }),
          cwd,
          signal: exec.signal,
        })
        return { text: outcome.text }
      },
      presentCall: (args) => ({
        card: 'generic',
        title: `Run sealed script ${args.script}`,
        kind: 'execute',
        rawInput: [args.script, ...(args.args ?? [])].join(' '),
      }),
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'sealed_doc',
      description:
        'Read one reference topic from this product skill. Topics are listed by sealed_assets; ask for the narrowest topic that answers the current question.',
      parameters: {
        topic: { type: 'string', required: true, description: 'Topic id from sealed_assets.' },
        skill: { type: 'string', description: 'Skill name that owns the topic.' },
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const sealed = await catalog()
        const hit = sealed.findDoc(args.topic, args.skill)
        if (hit === undefined) {
          throw new Error(`unknown sealed topic "${args.topic}"; call sealed_assets for the available ids`)
        }
        return { text: `# ${hit.doc.title}\n\n${hit.doc.text}` }
      },
      presentCall: (args) => ({
        card: 'generic',
        title: `Read sealed topic ${args.topic}`,
        kind: 'read',
        rawInput: args.topic,
      }),
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'sealed_status',
      description:
        'Report the identity of the sealed pack this deployment is running: pack digest, build time, and skill names. Use it when the user asks which build or license bundle is installed.',
      parameters: {},
      output: TEXT_OUTPUT,
      async execute() {
        const sealed = await catalog()
        const names = [...sealed.skills.keys()].sort()
        return {
          text: [
            `pack: ${sealed.packPath}`,
            `digest: ${sealed.digest}`,
            `built: ${sealed.builtAt}`,
            `skills: ${names.join(', ')}`,
          ].join('\n'),
        }
      },
    }),
  )
}
