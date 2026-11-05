#!/usr/bin/env node
/**
 * Build an encrypted skill pack from a plaintext source tree.
 *
 *   node bin/seal.mjs --src <dir> --out <file.pack> --secret <secret>
 *                     [--write-keyfile <file>] [--print-digest]
 *
 * Source layout (`<src>/skill.json`):
 *
 *   {
 *     "skills": [
 *       {
 *         "name": "complaint-triage",
 *         "description": "...",            // model-facing catalog line
 *         "whenToUse": "...",              // optional
 *         "invocation": { "modelInvocable": true, "userInvocable": true },
 *         "contentFile": "SKILL.md",       // optional; the model-facing body
 *         "plan": ["step one", "step two"],
 *         "scripts": [{ "id": "plan", "lang": "python",
 *                       "file": "scripts/plan.py",
 *                       "description": "one line for sealed_assets" }],
 *         "docs":    [{ "id": "rules", "title": "Rules",
 *                       "file": "docs/rules.md" }]
 *       }
 *     ]
 *   }
 *
 * Repeat `--src` to merge several source trees into one pack.
 *
 * Only the resulting `.pack` ships. Delete the source tree (or keep it in your
 * own build system, never in the customer image) — `--assert-no-plaintext`
 * fails the build when a pack directory still contains `.md`/script files.
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { bindSecretToMachine, sealPack } from '../lib/pack.js'

function parseArgs(argv) {
  const args = { src: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument "${token}"`)
    const key = token.slice(2)
    if (key === 'print-digest' || key === 'assert-no-plaintext') {
      args[key] = true
      continue
    }
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`--${key} needs a value`)
    index += 1
    if (key === 'src') args.src.push(value)
    else args[key] = value
  }
  return args
}

async function readManifestSources(dir) {
  const manifestPath = join(dir, 'skill.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const entries = Array.isArray(manifest.skills) ? manifest.skills : [manifest]
  const skills = []
  for (const entry of entries) {
    const read = async (file) => readFile(join(dir, file), 'utf8')
    const content =
      typeof entry.contentFile === 'string'
        ? stripFrontmatter(await read(entry.contentFile))
        : typeof entry.content === 'string'
          ? entry.content
          : undefined
    if (content === undefined) throw new Error(`${manifestPath}: skill "${entry.name}" needs contentFile or content`)
    skills.push({
      name: entry.name,
      description: entry.description,
      ...(entry.whenToUse === undefined ? {} : { whenToUse: entry.whenToUse }),
      ...(entry.invocation === undefined ? {} : { invocation: entry.invocation }),
      content,
      plan: entry.plan ?? [],
      scripts: await Promise.all(
        (entry.scripts ?? []).map(async (script) => ({
          id: script.id,
          lang: script.lang,
          description: script.description ?? '',
          code: await read(script.file),
        })),
      ),
      docs: await Promise.all(
        (entry.docs ?? []).map(async (doc) => ({
          id: doc.id,
          title: doc.title ?? doc.id,
          text: (await read(doc.file)).trim(),
        })),
      ),
    })
  }
  return skills
}

/** Drop a leading SKILL.md YAML frontmatter block; the manifest owns metadata. */
function stripFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/u.exec(text)
  return (match === null ? text : text.slice(match[0].length)).trim()
}

/** Refuse to ship a tree that still carries readable sources next to the pack. */
async function assertNoPlaintext(dir) {
  const offenders = []
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (/\.(md|py|js|mjs|sh|ps1|json|txt)$/u.test(entry.name)) offenders.push(path)
    }
  }
  await walk(dir)
  if (offenders.length > 0) {
    throw new Error(`plaintext sources still present in ${dir}:\n${offenders.join('\n')}`)
  }
}

const args = parseArgs(process.argv.slice(2))
if (args.src.length === 0) throw new Error('at least one --src is required')
if (args.out === undefined) throw new Error('--out is required')
if (args.secret === undefined) throw new Error('--secret is required')

const skills = []
for (const dir of args.src) skills.push(...(await readManifestSources(resolve(dir))))

const payload = {
  version: 1,
  builtAt: new Date().toISOString(),
  skills,
}
const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
const pack = sealPack(plaintext, args.secret)
const outPath = isAbsolute(args.out) ? args.out : resolve(process.cwd(), args.out)
await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, pack)

console.log(`skills: ${skills.length} (${skills.map((skill) => skill.name).join(', ')})`)
console.log(`plaintext: ${plaintext.length} bytes -> pack: ${pack.length} bytes`)
console.log(`sha256: ${createHash('sha256').update(pack).digest('hex')}`)
console.log(`wrote: ${outPath}`)

if (args['write-keyfile'] !== undefined) {
  const keyPath = isAbsolute(args['write-keyfile']) ? args['write-keyfile'] : resolve(process.cwd(), args['write-keyfile'])
  await writeFile(keyPath, JSON.stringify(bindSecretToMachine(args.secret), null, 2))
  console.log(`machine-bound key file: ${keyPath}`)
}
if (args['assert-no-plaintext'] === true) {
  for (const dir of args.src) await assertNoPlaintext(resolve(dir))
  console.log('plaintext check: clean')
}
