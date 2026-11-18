/**
 * Find and replace inside Canvas titles and HTML bodies. Pure functions, no Canvas calls, so
 * every rule here is covered by test/replace.test.ts.
 *
 * Three modes, matching the three buttons on the screen:
 *
 * - **text**: words people read. Only text between tags changes, never tag names, attributes or
 *   links, so replacing "Spring 2026" cannot break an `href`. A space in what is typed also
 *   matches a non-breaking space, because the Canvas editor inserts `&nbsp;` freely.
 * - **title**: renaming or renumbering ("Lab 5" → "Lab 6"). Same as text, with whole-word edges, so
 *   "Lab 5" does not match inside "Lab 50".
 * - **link**: web addresses. Matches in attributes (href, src) and text alike, including the
 *   `&amp;` form an address takes inside HTML. Unless longer links are allowed, the match must end
 *   where the address ends, so `…/guide` does not also rewrite `…/guide-2`.
 */
import type { FindMode } from '../../src/shared/api'

export interface ReplaceSpec {
  mode: FindMode
  find: string
  replace: string
  matchLongerLinks: boolean
  caseSensitive: boolean
}

export interface ReplaceResult {
  value: string
  count: number
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Characters that can continue a web address. */
const URL_CHAR = "[\\w\\-./?#=&%~+:@!$'()*,;]"

const WORD = /\w/

/** The pattern for one piece of text; `html` when it will run over text between tags. */
function textPattern(spec: ReplaceSpec, html: boolean): RegExp | null {
  const find = spec.find
  if (!find.trim()) return null
  // In HTML, & < > may be stored as entities or, for &, as itself: match whichever is there.
  const piece = (p: string): string =>
    html
      ? escapeRegExp(p).replace(/&/g, '&(?:amp;)?').replace(/</g, '&lt;').replace(/>/g, '(?:>|&gt;)')
      : escapeRegExp(p)
  // Each run of spaces in the search also matches a non-breaking space, written either way.
  const body = find
    .split(/\s+/)
    .map(piece)
    .join(html ? '(?:\\s|&nbsp;|&#160;|\\u00a0)+' : '[\\s\\u00a0]+')
  const wholeWord = spec.mode === 'title'
  const lead = wholeWord && WORD.test(find[0]) ? '(?<![\\w])' : ''
  const trail = wholeWord && WORD.test(find[find.length - 1]) ? '(?![\\w])' : ''
  return new RegExp(lead + body + trail, spec.caseSensitive ? 'g' : 'gi')
}

function linkPattern(spec: ReplaceSpec): RegExp | null {
  const find = spec.find.trim()
  if (!find) return null
  const forms = [find]
  const amp = find.replace(/&/g, '&amp;')
  if (amp !== find) forms.push(amp)
  const end = spec.matchLongerLinks ? '' : `(?!${URL_CHAR})`
  // Web addresses are compared exactly; only the scheme and host are case-insensitive in
  // theory, and treating the path the same way would rewrite links it should not.
  return new RegExp(`(?:${forms.map(escapeRegExp).join('|')})${end}`, 'g')
}

/** Replace in a plain-text title. */
export function replaceInTitle(title: string, spec: ReplaceSpec): ReplaceResult {
  const re = spec.mode === 'link' ? linkPattern(spec) : textPattern(spec, false)
  if (!re) return { value: title, count: 0 }
  let count = 0
  const value = title.replace(re, () => {
    count++
    return spec.mode === 'link' ? spec.replace.trim() : spec.replace
  })
  return { value, count }
}

/** Replace in an HTML body. */
export function replaceInHtml(html: string, spec: ReplaceSpec): ReplaceResult {
  if (spec.mode === 'link') {
    const re = linkPattern(spec)
    if (!re) return { value: html, count: 0 }
    const plain = spec.find.trim()
    const replacement = spec.replace.trim()
    let count = 0
    const value = html.replace(re, (m) => {
      count++
      // Keep the form the address was found in: inside an attribute, & is written &amp;.
      return m === plain ? replacement : replacement.replace(/&/g, '&amp;')
    })
    return { value, count }
  }

  const re = textPattern(spec, true)
  if (!re) return { value: html, count: 0 }
  const replacement = escapeHtml(spec.replace)
  let count = 0
  // Split into tags and the text between them; odd indexes are tags and are left alone.
  const parts = html.split(/(<[^>]*>)/)
  let inScriptOrStyle = false
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (i % 2 === 1) {
      if (/^<(script|style)\b/i.test(part)) inScriptOrStyle = true
      else if (/^<\/(script|style)\b/i.test(part)) inScriptOrStyle = false
      continue
    }
    if (inScriptOrStyle || !part) continue
    parts[i] = part.replace(re, () => {
      count++
      return replacement
    })
  }
  return { value: parts.join(''), count }
}

// ─── Excerpts for the side-by-side preview ───────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', '#160': ' ' }

/** Readable text from HTML: tags dropped, common entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>/gi, ' [link: $1] ')
    .replace(/<(img|iframe)\b[^>]*\bsrc="([^"]*)"[^>]*>/gi, ' [$1: $2] ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp|#160);/g, (_m, e: string) => ENTITIES[e] ?? _m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/**
 * A short window of text around the first place `needle` appears, so the preview can show
 * "…complete Lab 5 by Sunday…" rather than a whole page. Falls back to the start of the text.
 */
export function excerptAround(text: string, needle: string, radius = 70): string {
  const flat = text.replace(/\s+/g, ' ')
  const at = needle ? flat.toLowerCase().indexOf(needle.toLowerCase()) : -1
  if (at < 0) return flat.length > radius * 2 ? `${flat.slice(0, radius * 2)}…` : flat
  const start = Math.max(0, at - radius)
  const end = Math.min(flat.length, at + needle.length + radius)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}
