/**
 * Sealed catalog: the decrypted, in-memory view of one pack.
 *
 * This module knows nothing about Cordis. `lib/index.js` adapts it to the
 * `ctx.skills` / `ctx.tools` seams; everything here is directly testable.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { openPack, resolveSecret } from './pack.js'
import { runSealedScript } from './runner.js'

/** Fields every decrypted script must carry. */
function normalizeScript(raw, skillName) {
  if (typeof raw !== 'object' || raw === null) throw new Error(`skill "${skillName}": script entry must be an object`)
  const { id, lang, code, description } = raw
  if (typeof id !== 'string' || id.length === 0) throw new Error(`skill "${skillName}": script without id`)
  if (typeof code !== 'string' || code.length === 0) throw new Error(`skill "${skillName}": script "${id}" without code`)
  if (lang !== 'node' && lang !== 'python' && lang !== 'bash') {
    throw new Error(`skill "${skillName}": script "${id}" has unsupported lang "${String(lang)}"`)
  }
  return { id, lang, code, description: typeof description === 'string' ? description : '' }
}

function normalizeDoc(raw, skillName) {
  if (typeof raw !== 'object' || raw === null) throw new Error(`skill "${skillName}": doc entry must be an object`)
  const { id, title, text } = raw
  if (typeof id !== 'string' || id.length === 0) throw new Error(`skill "${skillName}": doc without id`)
  if (typeof text !== 'string') throw new Error(`skill "${skillName}": doc "${id}" without text`)
  return { id, title: typeof title === 'string' ? title : id, text }
}

function normalizeSkill(raw) {
  if (typeof raw !== 'object' || raw === null) throw new Error('sealed pack: skill entry must be an object')
  const { name, description, content } = raw
  if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`sealed pack: invalid skill name "${String(name)}"`)
  }
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`sealed pack: skill "${name}" has no description`)
  }
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`sealed pack: skill "${name}" has no content`)
  }
  const invocation = raw.invocation ?? { modelInvocable: true, userInvocable: true }
  return {
    name,
    description,
    whenToUse: typeof raw.whenToUse === 'string' ? raw.whenToUse : undefined,
    invocation: {
      modelInvocable: invocation.modelInvocable !== false,
      userInvocable: invocation.userInvocable !== false,
    },
    content,
    plan: Array.isArray(raw.plan) ? raw.plan.filter((step) => typeof step === 'string') : [],
    scripts: (raw.scripts ?? []).map((script) => normalizeScript(script, name)),
    docs: (raw.docs ?? []).map((doc) => normalizeDoc(doc, name)),
  }
}

/**
 * One decrypted pack, ready to serve.
 */
export class SealedCatalog {
  /**
   * @param {object} options
   * @param {string} options.packPath absolute path of the encrypted pack
   * @param {string} options.secret pack secret
   * @param {string} [options.providerName] surfaced as the skill provider name
   * @param {string} [options.source] surfaced as the skill source label
   * @param {number} [options.rank] precedence rank against other providers
   * @param {Record<string,string>} [options.runtimes] interpreter overrides
   * @param {number} [options.timeoutMs] per-script wall clock
   * @param {string} [options.resourceHint] model-facing opaque resource description
   */
  constructor(options) {
    /** @type {Map<string, any>} */
    this.skills = new Map()
    this.packPath = options.packPath
    this.providerName = options.providerName ?? 'sealed'
    this.source = options.source ?? 'sealed'
    this.rank = options.rank ?? 600
    this.runtimes = options.runtimes ?? {}
    this.timeoutMs = options.timeoutMs ?? 120_000
    this.resourceHint =
      options.resourceHint ??
      'Sealed product resources. Read them only through the sealed_* tools; no filesystem path is provided for this skill.'
    this.digest = ''
    this.builtAt = ''
    this.secret = options.secret
  }

  /**
   * Decrypt and validate a pack.
   * @param {object} options
   * @param {string} options.packPath
   * @param {object} [options.keyConfig] forwarded to resolveSecret
   * @returns {Promise<SealedCatalog>}
   */
  static async open(options) {
    const pack = await readFile(options.packPath)
    const secret = await resolveSecret(options.keyConfig ?? {})
    const catalog = new SealedCatalog({ ...options, secret })
    catalog.load(pack, secret)
    return catalog
  }

  /**
   * Decrypt an in-memory pack buffer into this catalog.
   * @param {Buffer} pack
   * @param {string} secret
   */
  load(pack, secret) {
    const plaintext = openPack(pack, secret)
    this.digest = createHash('sha256').update(pack).digest('hex').slice(0, 16)
    let payload
    try {
      payload = JSON.parse(plaintext.toString('utf8'))
    } catch (error) {
      throw new Error(`sealed pack payload is not valid JSON: ${error.message}`)
    }
    if (typeof payload !== 'object' || payload === null || !Array.isArray(payload.skills)) {
      throw new Error('sealed pack payload must be an object with a skills array')
    }
    this.builtAt = typeof payload.builtAt === 'string' ? payload.builtAt : ''
    this.skills.clear()
    for (const raw of payload.skills) {
      const skill = normalizeSkill(raw)
      if (this.skills.has(skill.name)) throw new Error(`sealed pack: duplicate skill "${skill.name}"`)
      this.skills.set(skill.name, skill)
    }
  }

  /** Invocation-neutral summaries, the same shape `ctx.skills.list()` expects. */
  summaries() {
    return [...this.skills.values()]
      .map((skill) => ({
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
        invocation: { ...skill.invocation },
        source: this.source,
        provider: this.providerName,
        resourceBase: { kind: 'opaque', description: this.resourceHint },
      }))
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  }

  /**
   * The full skill definition handed to `ctx.skills.get()`.
   * @param {string} name
   */
  definition(name) {
    const skill = this.skills.get(name)
    if (skill === undefined) return undefined
    return {
      name: skill.name,
      description: skill.description,
      ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
      invocation: { ...skill.invocation },
      source: this.source,
      provider: this.providerName,
      resourceBase: { kind: 'opaque', description: this.resourceHint },
      content: skill.content,
    }
  }

  /**
   * Resolve a script id, optionally scoped to one skill.
   * @param {string} id
   * @param {string} [skillName]
   */
  findScript(id, skillName) {
    const pools = skillName === undefined ? [...this.skills.values()] : [this.skills.get(skillName)]
    for (const skill of pools) {
      if (skill === undefined) continue
      const hit = skill.scripts.find((script) => script.id === id)
      if (hit !== undefined) return { skill, script: hit }
    }
    return undefined
  }

  /**
   * Resolve a reference document, optionally scoped to one skill.
   * @param {string} id
   * @param {string} [skillName]
   */
  findDoc(id, skillName) {
    const pools = skillName === undefined ? [...this.skills.values()] : [this.skills.get(skillName)]
    for (const skill of pools) {
      if (skill === undefined) continue
      const hit = skill.docs.find((doc) => doc.id === id)
      if (hit !== undefined) return { skill, doc: hit }
    }
    return undefined
  }

  /** The model-facing inventory: ids and one-line descriptions, never bodies. */
  inventory(skillName) {
    const skills = skillName === undefined ? [...this.skills.values()] : [this.skills.get(skillName)]
    const lines = []
    for (const skill of skills) {
      if (skill === undefined) continue
      lines.push(`skill: ${skill.name}`)
      if (skill.scripts.length > 0) {
        lines.push('scripts:')
        for (const script of skill.scripts) lines.push(`- ${script.id}: ${script.description} (${script.lang})`)
      }
      if (skill.docs.length > 0) {
        lines.push('docs:')
        for (const doc of skill.docs) lines.push(`- ${doc.id}: ${doc.title}`)
      }
    }
    return lines.join('\n')
  }

  /**
   * Execute a sealed script in memory.
   * @param {string} id
   * @param {{args?:string[], skill?:string, cwd:string, signal?:AbortSignal}} request
   */
  async run(id, request) {
    const hit = this.findScript(id, request.skill)
    if (hit === undefined) {
      throw new Error(`unknown sealed script "${id}"; call sealed_assets for the available ids`)
    }
    const result = await runSealedScript({
      code: hit.script.code,
      lang: hit.script.lang,
      args: request.args ?? [],
      cwd: request.cwd,
      signal: request.signal,
      timeoutMs: this.timeoutMs,
      runtimes: this.runtimes,
    })
    const parts = []
    if (result.stdout.trim().length > 0) parts.push(result.stdout.trimEnd())
    if (result.stderr.trim().length > 0) parts.push(`[stderr]\n${result.stderr.trimEnd()}`)
    if (result.timedOut) parts.push(`[timed out after ${this.timeoutMs} ms]`)
    if (result.truncated) parts.push('[output truncated]')
    parts.push(`[exit ${String(result.exitCode)}]`)
    return { text: parts.join('\n\n'), result, script: hit.script }
  }
}
