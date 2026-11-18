/**
 * Which Canvas the app talks to, and the client that talks to it.
 *
 * Only `*.instructure.com` sites are accepted, as in Canvas Extractor Tools: the token is sent to
 * whatever site is saved here, so the check keeps it from going anywhere else.
 */
import { CanvasLMS } from '../core/canvas'
import { loadToken, readSettings } from './store'

const ALLOWED = /(^|\.)instructure\.com$/i

/**
 * "myschool.instructure.com", "https://myschool.instructure.com/" and a full course address all
 * give "https://myschool.instructure.com". Anything else gives null.
 */
export function normalizeSite(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (url.protocol !== 'https:' || !ALLOWED.test(url.hostname)) return null
    return url.origin
  } catch {
    return null
  }
}

/** The course id in a Canvas course address on `site`, or null. */
export function courseIdFromAddress(address: string, site: string): string | null {
  const text = address.trim()
  if (/^\d+$/.test(text)) return text
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (url.origin !== site) return null
    const m = /\/courses\/(\d+)/.exec(url.pathname)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export class NoTokenError extends Error {
  constructor() {
    super('No Canvas token is saved yet. Add one in Initial setup.')
  }
}

/** A Canvas client for the saved site and token. */
export function canvasClient(): CanvasLMS {
  const token = loadToken()
  if (!token) throw new NoTokenError()
  return new CanvasLMS({ token, endpoint: readSettings().site })
}
