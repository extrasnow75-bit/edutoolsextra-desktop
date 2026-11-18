/**
 * What the app remembers between launches, all in the app's own data folder.
 *
 * - `settings.json`: the Canvas site, the courses the last session used, saved course groups and
 *   the zoom level. Nothing secret.
 * - `canvas-token.bin`: the Canvas token, encrypted with Electron's safeStorage, which uses the
 *   macOS Keychain or Windows' own data protection. It is decrypted only in this process, only to
 *   make a Canvas request, and never sent to the window. The window learns only whether a token
 *   is saved and its last four characters.
 *
 * Paths come from `setDataDir`, so tests can point the store at a temporary folder.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SavedGroup, SessionCourse } from '../../src/shared/api'

export const DEFAULT_SITE = 'https://boisestatecanvas.instructure.com'

export interface Settings {
  site: string
  sessionCourses: SessionCourse[]
  groups: SavedGroup[]
  zoom: number
}

const DEFAULTS: Settings = { site: DEFAULT_SITE, sessionCourses: [], groups: [], zoom: 0 }

/** Encryption, injected so the store can be tested outside Electron. */
export interface Cipher {
  available(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

let dataDir = ''
let cipher: Cipher | null = null

export function setDataDir(dir: string, c: Cipher): void {
  dataDir = dir
  cipher = c
  mkdirSync(dir, { recursive: true })
}

export function dataPath(...parts: string[]): string {
  if (!dataDir) throw new Error('The data folder is not set yet.')
  return join(dataDir, ...parts)
}

/** Write a file so a crash halfway cannot leave it half-written. */
export function writeAtomic(path: string, text: string | Buffer): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, path)
}

export function readSettings(): Settings {
  try {
    const raw = JSON.parse(readFileSync(dataPath('settings.json'), 'utf8')) as Partial<Settings>
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch }
  writeAtomic(dataPath('settings.json'), JSON.stringify(next, null, 2))
  return next
}

// ─── The token ────────────────────────────────────────────────────────────────

const TOKEN_FILE = 'canvas-token.bin'

export function encryptionAvailable(): boolean {
  return cipher?.available() ?? false
}

export function saveToken(token: string): void {
  if (!cipher || !cipher.available()) {
    throw new Error("This computer's keychain is not available, so the token cannot be stored safely.")
  }
  writeAtomic(dataPath(TOKEN_FILE), cipher.encrypt(token.trim()))
}

/** The token, or null. Only for making a Canvas request in this process. */
export function loadToken(): string | null {
  const path = dataPath(TOKEN_FILE)
  if (!existsSync(path) || !cipher?.available()) return null
  try {
    const token = cipher.decrypt(readFileSync(path)).trim()
    return token || null
  } catch {
    return null
  }
}

export function removeToken(): void {
  const path = dataPath(TOKEN_FILE)
  if (existsSync(path)) unlinkSync(path)
}

/** The last four characters, for "token ending ••••7Hq2". */
export function tokenHint(): string {
  const t = loadToken()
  return t ? t.slice(-4) : ''
}
