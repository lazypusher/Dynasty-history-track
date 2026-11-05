/**
 * Sealed skill pack format (v1).
 *
 *   [ magic "DSHSK1" ][ version 1B ][ salt 16B ][ iv 12B ][ ciphertext ][ tag 16B ]
 *
 * AES-256-GCM, key = scrypt(secret, salt). The header is bound as AAD so a
 * tampered version/magic/salt cannot be replayed against a different key.
 *
 * Threat model note: this protects bytes AT REST against copying, grepping and
 * off-machine reuse. It does NOT protect against a determined local
 * administrator who can read process memory while the harness is running.
 * See README "能防住什么".
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { hostname, networkInterfaces } from 'node:os'

const MAGIC = Buffer.from('DSHSK1', 'ascii')
const VERSION = 1
const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN + IV_LEN

const SCRYPT = { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

/** @param {string|Buffer} secret @param {Buffer} salt @returns {Buffer} */
function deriveKey(secret, salt) {
  return scryptSync(secret, salt, 32, SCRYPT)
}

/**
 * Encrypt a plaintext payload into a pack buffer.
 * @param {Buffer} plaintext
 * @param {string} secret
 * @returns {Buffer}
 */
export function sealPack(plaintext, secret) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('sealed pack secret must be a string of at least 16 characters')
  }
  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv])
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv)
  cipher.setAAD(header)
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([header, body, cipher.getAuthTag()])
}

/**
 * Decrypt a pack buffer.
 * @param {Buffer} pack
 * @param {string} secret
 * @returns {Buffer}
 */
export function openPack(pack, secret) {
  if (pack.length < HEADER_LEN + TAG_LEN) throw new Error('sealed pack is truncated')
  const magic = pack.subarray(0, MAGIC.length)
  if (!magic.equals(MAGIC)) throw new Error('not a sealed skill pack (bad magic)')
  const version = pack[MAGIC.length]
  if (version !== VERSION) throw new Error(`unsupported sealed pack version ${version}`)
  const salt = pack.subarray(MAGIC.length + 1, MAGIC.length + 1 + SALT_LEN)
  const iv = pack.subarray(MAGIC.length + 1 + SALT_LEN, HEADER_LEN)
  const tag = pack.subarray(pack.length - TAG_LEN)
  const body = pack.subarray(HEADER_LEN, pack.length - TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, salt), iv)
  decipher.setAAD(pack.subarray(0, HEADER_LEN))
  decipher.setAuthTag(tag)
  // A wrong secret surfaces here as "Unsupported state or unable to authenticate data".
  return Buffer.concat([decipher.update(body), decipher.final()])
}

/**
 * Stable per-machine fingerprint used to bind a cached key file to this host.
 * @returns {string}
 */
export function machineFingerprint() {
  const macs = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry !== undefined && !entry.internal && entry.mac !== '00:00:00:00:00:00')
    .map((entry) => entry.mac)
    .sort()
  const material = [hostname(), process.platform, process.arch, macs[0] ?? 'no-mac'].join('|')
  return createHash('sha256').update(material).digest('hex').slice(0, 16)
}

/**
 * Bind a secret to this machine, for deployments that must start offline.
 * This is obfuscation, not a hardware root of trust: the derivation lives on
 * the same disk it protects. Its job is to stop "copy the profile folder to
 * another machine and run it", not to stop a reverse engineer.
 * @param {string} secret
 * @returns {{v:number, fp:string, data:string}}
 */
export function bindSecretToMachine(secret) {
  const fp = machineFingerprint()
  const key = scryptSync(`${fp}|dsh-sealed-local-v1`, 'dsh-sealed-static-salt', 32, SCRYPT)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return {
    v: 1,
    fp,
    data: Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64'),
  }
}

/**
 * Recover a machine-bound secret.
 * @param {{v:number, fp:string, data:string}} record
 * @returns {string}
 */
export function unbindSecretFromMachine(record) {
  const fp = machineFingerprint()
  if (record.fp !== fp) throw new Error('sealed key file is bound to a different machine')
  const raw = Buffer.from(record.data, 'base64')
  const iv = raw.subarray(0, IV_LEN)
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const body = raw.subarray(IV_LEN + TAG_LEN)
  const key = scryptSync(`${fp}|dsh-sealed-local-v1`, 'dsh-sealed-static-salt', 32, SCRYPT)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}

/**
 * Resolve the pack secret from, in order: explicit config, environment, a
 * machine-bound key file. A production deployment should prefer the key file
 * (offline) or a license-server activation written to that same file (online),
 * and keep the env var for development only.
 * @param {{key?:string, keyFile?:string}} config
 * @returns {Promise<string>}
 */
export async function resolveSecret(config = {}) {
  const direct = config.key ?? process.env.DSH_SEAL_KEY
  if (typeof direct === 'string' && direct.length > 0) return direct
  const keyFile = config.keyFile ?? process.env.DSH_SEAL_KEY_FILE
  if (typeof keyFile === 'string' && keyFile.length > 0) {
    const record = JSON.parse(await readFile(keyFile, 'utf8'))
    return unbindSecretFromMachine(record)
  }
  throw new Error(
    'sealed pack secret unavailable: set config.key, DSH_SEAL_KEY, or config.keyFile / DSH_SEAL_KEY_FILE',
  )
}
