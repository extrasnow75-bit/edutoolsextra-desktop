/**
 * The one way any tool in this app changes Canvas.
 *
 * A tool's preview produces a list of `Op`s. Nothing is written until the person says yes; then
 * `runOps` carries them out one at a time, in order, and each one:
 *
 * 1. reads the object again and checks it still holds what the preview showed. If someone changed
 *    it in Canvas in between, it is left alone and reported, never overwritten;
 * 2. writes the change;
 * 3. reads it back and checks the change landed (Canvas answers OK even when it quietly drops
 *    part of a page; Shane's verify step exists for the same reason).
 *
 * What was there before is kept in the `AppliedOp` records, which history.ts saves as the
 * backup. `undoOps` turns those records back into ops that restore the old values, with the same
 * check: an item edited again since is left alone.
 */
import type { CanvasLMS } from '../core/canvas'
import type { Payload } from '../core/types'
import type { ApplyOutcome } from '../../src/shared/api'

export type FieldKind = 'text' | 'html' | 'date'

export interface OpField {
  /** Form key to write: "wiki_page[body]", "assignment[due_at]". */
  key: string
  /** Key in the object Canvas returns: "body", "due_at". */
  read: string
  before: string | null
  after: string | null
  kind: FieldKind
}

export type Op =
  | {
      type: 'update'
      id: string
      courseId: string
      label: string
      /** Path to GET the object, relative to the site. Includes any query it needs. */
      getPath: string
      putPath: string
      fields: OpField[]
    }
  | {
      type: 'create'
      id: string
      courseId: string
      label: string
      postPath: string
      data: Array<[string, string]>
      /** Path to DELETE the created object; `{id}` is replaced with the new object's id. */
      undoPath: string
      /** Where the new object's id is in Canvas's answer, when it is not plain "id". */
      idKey?: string
      verify?: { getPath: string; read: string; equals: string }
      /** A specific way to undo this, instead of deleting what was created. */
      undoOp?: Op
    }
  | {
      type: 'delete'
      id: string
      courseId: string
      label: string
      deletePath: string
      /** How to put it back. */
      recreate: { postPath: string; data: Array<[string, string]>; undoPath: string; idKey?: string }
    }

export interface AppliedOp {
  op: Op
  /** For a create: the id Canvas gave the new object. */
  createdId?: string
}

/** Read a dotted key such as "rubric_settings.id" out of a Canvas object. */
export function readKey(obj: Payload, key: string): string | null {
  let cur: unknown = obj
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return null
    cur = (cur as Record<string, unknown>)[part]
  }
  if (cur === null || cur === undefined) return null
  return String(cur)
}

/** Whether two field values are the same, by the field's own rules. */
export function sameValue(kind: FieldKind, a: string | null, b: string | null): boolean {
  if (kind === 'date') {
    if (!a || !b) return !a && !b
    return Date.parse(a) === Date.parse(b)
  }
  return (a ?? '') === (b ?? '')
}

/**
 * Whether a written value landed. Dates and plain text must match exactly. Canvas rewrites HTML as
 * it saves it (attribute order, entity forms), so a body only has to have changed from what was
 * there and to carry the new words.
 */
export function landed(field: OpField, current: string | null, marker?: string): boolean {
  if (field.kind !== 'html') return sameValue(field.kind, current, field.after)
  if (sameValue('html', current, field.before)) return false
  return marker ? (current ?? '').includes(marker) : true
}

export interface RunOptions {
  /** Called before each op: done so far, total, and what is being changed. */
  onProgress?: (done: number, total: number, label: string) => void
  /** For bodies: text the new HTML must contain, such as the replacement. */
  htmlMarker?: string
}

export async function runOps(
  client: CanvasLMS,
  ops: Op[],
  options: RunOptions = {},
): Promise<{ outcomes: ApplyOutcome[]; applied: AppliedOp[] }> {
  const outcomes: ApplyOutcome[] = []
  const applied: AppliedOp[] = []
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    options.onProgress?.(i, ops.length, op.label)
    try {
      if (op.type === 'update') {
        const current = await client.getJson(op.getPath)
        const drifted = op.fields.find((f) => !sameValue(f.kind, readKey(current, f.read), f.before))
        if (drifted) {
          outcomes.push({
            changeId: op.id,
            ok: false,
            message: `Left alone: it was changed in Canvas after the preview (${drifted.read}). Search again to see it as it is now.`,
          })
          continue
        }
        const data: Array<[string, string]> = op.fields.map((f) => [f.key, f.after ?? ''])
        await client.putJson(op.putPath, data)
        const after = await client.getJson(op.getPath)
        const missing = op.fields.find((f) => !landed(f, readKey(after, f.read), f.kind === 'html' ? options.htmlMarker : undefined))
        applied.push({ op })
        outcomes.push(
          missing
            ? { changeId: op.id, ok: false, message: `Saved, but Canvas did not keep the change to ${missing.read}. Check it in Canvas.` }
            : { changeId: op.id, ok: true },
        )
      } else if (op.type === 'create') {
        const made = await client.postJson(op.postPath, op.data)
        const createdId = readKey(made, op.idKey ?? 'id') ?? undefined
        applied.push({ op, createdId })
        if (op.verify) {
          const check = await client.getJson(op.verify.getPath)
          const ok = readKey(check, op.verify.read) === op.verify.equals
          outcomes.push(ok ? { changeId: op.id, ok: true } : { changeId: op.id, ok: false, message: 'Saved, but Canvas does not show it yet. Check it in Canvas.' })
        } else {
          outcomes.push({ changeId: op.id, ok: true })
        }
      } else {
        await client.deleteJson(op.deletePath)
        applied.push({ op })
        outcomes.push({ changeId: op.id, ok: true })
      }
    } catch (error) {
      outcomes.push({ changeId: op.id, ok: false, message: plainError(error) })
    }
  }
  options.onProgress?.(ops.length, ops.length, 'Done')
  return { outcomes, applied }
}

/** The ops that put back what `applied` changed, newest first. */
export function undoOps(applied: AppliedOp[]): Op[] {
  const out: Op[] = []
  for (const record of [...applied].reverse()) {
    const op = record.op
    if (op.type === 'update') {
      out.push({
        ...op,
        id: `undo-${op.id}`,
        label: `Undo: ${op.label}`,
        fields: op.fields.map((f) => ({ ...f, before: f.after, after: f.before })),
      })
    } else if (op.type === 'create' && op.undoOp) {
      out.push({ ...op.undoOp, id: `undo-${op.id}`, label: `Undo: ${op.label}` })
    } else if (op.type === 'create' && record.createdId) {
      out.push({
        type: 'delete',
        id: `undo-${op.id}`,
        courseId: op.courseId,
        label: `Undo: ${op.label}`,
        deletePath: op.undoPath.replace('{id}', record.createdId),
        recreate: { postPath: op.postPath, data: op.data, undoPath: op.undoPath, idKey: op.idKey },
      })
    } else if (op.type === 'delete') {
      out.push({
        type: 'create',
        id: `undo-${op.id}`,
        courseId: op.courseId,
        label: `Undo: ${op.label}`,
        postPath: op.recreate.postPath,
        data: op.recreate.data,
        undoPath: op.recreate.undoPath,
        idKey: op.recreate.idKey,
      })
    }
  }
  return out
}

/** A Canvas or network error in words a designer can act on. */
export function plainError(error: unknown): string {
  const status = (error as { status?: number })?.status
  if (status === 401) return 'Canvas did not accept your token. It may have expired: replace it in Initial setup.'
  if (status === 403) return 'Your Canvas role is not allowed to change this.'
  if (status === 404) return 'Canvas could not find it. It may have been deleted.'
  const msg = error instanceof Error ? error.message : String(error)
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|TimeoutError/i.test(msg)) return 'Could not reach Canvas. Check your internet connection and try again.'
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg
}
