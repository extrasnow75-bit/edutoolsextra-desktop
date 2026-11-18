/**
 * Recent changes: one list of everything the app changed in Canvas, newest first, with a backup
 * of each change so it can be undone.
 *
 * The list lives in `history.json` and each change's backup in `backups/<id>.json`, both in the
 * app's data folder on this computer. It is not shared between colleagues yet; that needs a shared
 * place such as a Google Sheet, and is a later step.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { ApplyOutcome, HistoryEntry, HistoryTool } from '../../src/shared/api'
import type { AppliedOp } from './ops'
import { dataPath, writeAtomic } from './store'

const KEEP = 200

interface Backup {
  applied: AppliedOp[]
  htmlMarker?: string
}

export function listHistory(): HistoryEntry[] {
  try {
    return JSON.parse(readFileSync(dataPath('history.json'), 'utf8')) as HistoryEntry[]
  } catch {
    return []
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  writeAtomic(dataPath('history.json'), JSON.stringify(entries.slice(0, KEEP), null, 2))
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function record(args: {
  tool: HistoryTool
  title: string
  courses: string[]
  outcomes: ApplyOutcome[]
  applied: AppliedOp[]
  htmlMarker?: string
  summaryWords: string
}): HistoryEntry {
  const id = newId()
  const ok = args.outcomes.filter((o) => o.ok).length
  const failed = args.outcomes.length - ok
  const entry: HistoryEntry = {
    id,
    tool: args.tool,
    title: args.title,
    courses: args.courses,
    summary: `${ok} ${args.summaryWords}${failed ? ` · ${failed} not changed` : ''}`,
    status: failed ? 'problems' : 'done',
    when: new Date().toISOString(),
    undoable: args.applied.length > 0,
    undone: false,
  }
  if (args.applied.length > 0) {
    mkdirSync(dataPath('backups'), { recursive: true })
    const backup: Backup = { applied: args.applied, htmlMarker: args.htmlMarker }
    writeAtomic(dataPath('backups', `${id}.json`), JSON.stringify(backup))
  }
  saveHistory([entry, ...listHistory()])
  return entry
}

export function readBackup(id: string): Backup | null {
  const path = dataPath('backups', `${id}.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Backup
  } catch {
    return null
  }
}

export function markUndone(id: string): void {
  saveHistory(listHistory().map((e) => (e.id === id ? { ...e, undone: true, undoable: false } : e)))
}

// ─── Previews waiting for a yes ───────────────────────────────────────────────

/**
 * Previews are kept here, in this process, and the window sends back only the ids of the changes
 * it wants. So what gets written is exactly what was previewed, never something the window made up.
 */
const previews = new Map<string, { ops: Map<string, import('./ops').Op[]>; htmlMarker?: string; courses: string[] }>()

export function keepPreview(ops: Map<string, import('./ops').Op[]>, courses: string[], htmlMarker?: string): string {
  const id = newId()
  previews.set(id, { ops, htmlMarker, courses })
  // Only the latest few are needed; an old preview is stale anyway.
  while (previews.size > 10) previews.delete(previews.keys().next().value as string)
  return id
}

export function takePreview(id: string) {
  const p = previews.get(id)
  previews.delete(id)
  return p
}
