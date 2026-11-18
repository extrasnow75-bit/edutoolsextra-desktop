/**
 * Get ready for teaching, first version: dates only, worked out from term dates the person types
 * (AI-suggested dates come later). For each selected course it proposes:
 *
 * - **Shift dates**: every assignment's due, available-from and until dates move by the gap
 *   between the old term's first Monday and the new one's, keeping the time of day. Ungraded
 *   discussions and practice quizzes move too. Section or student dates (overrides) are reported,
 *   not moved, in this version.
 * - **Module unlock dates**: a module whose title names its week ("Module 5", "Week 5") unlocks at
 *   midnight on that week's Monday.
 * - **Dates in module titles**: "Module 5: Firewalls (February 8 – February 14)", replacing any
 *   dates already there. The convention Shane's edutools uses and eCampus adopted.
 * - **Holiday headers**: a text header in the module for the week a holiday falls in, and one at
 *   the end of the module before a break week.
 */
import type { CanvasLMS } from '../core/canvas'
import type { Payload } from '../core/types'
import type { Preview, ProposedChange, TermRequest } from '../../src/shared/api'
import { keepPreview } from './history'
import { type Op, type OpField, plainError } from './ops'
import { daysBetween, datedTitle, isWithin, moduleWeek, rangeLabel, shiftIso, showDate, type TermShape, weekOf, weekStart } from './termMath'

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const opt = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

interface DateKeys {
  write: string
  read: string
  label: string
}

const ASSIGNMENT_DATES: DateKeys[] = [
  { write: 'assignment[due_at]', read: 'due_at', label: 'Due' },
  { write: 'assignment[unlock_at]', read: 'unlock_at', label: 'Available from' },
  { write: 'assignment[lock_at]', read: 'lock_at', label: 'Until' },
]
const TOPIC_DATES: DateKeys[] = [
  { write: 'delayed_post_at', read: 'delayed_post_at', label: 'Available from' },
  { write: 'lock_at', read: 'lock_at', label: 'Until' },
]
const QUIZ_DATES: DateKeys[] = [
  { write: 'quiz[due_at]', read: 'due_at', label: 'Due' },
  { write: 'quiz[unlock_at]', read: 'unlock_at', label: 'Available from' },
  { write: 'quiz[lock_at]', read: 'lock_at', label: 'Until' },
]

export interface Plan {
  changes: ProposedChange[]
  ops: Map<string, Op[]>
}

/** The date changes for one object, or null when it has no dates. */
function shiftObject(
  obj: Payload, keys: DateKeys[], days: number, req: TermRequest,
): { fields: OpField[]; shown: ProposedChange['fields']; warnings: string[] } | null {
  const fields: OpField[] = []
  const shown: ProposedChange['fields'] = []
  const warnings: string[] = []
  for (const k of keys) {
    const before = opt(obj[k.read])
    if (!before) continue
    const after = shiftIso(before, days, req.timezone)
    fields.push({ key: k.write, read: k.read, before, after, kind: 'date' })
    shown.push({ field: k.read, label: k.label, beforeText: showDate(before, req.timezone), afterText: showDate(after, req.timezone) })
    if (k.read === 'due_at') {
      if (req.breakWeek && isWithin(after, req.breakWeek, plusDays(req.breakWeek, 6), req.timezone)) {
        warnings.push('The new due date falls in the break week.')
      }
      for (const h of req.holidays) {
        if (isWithin(after, h.start, h.end, req.timezone)) warnings.push(`The new due date falls on ${h.label}.`)
      }
    }
  }
  return fields.length ? { fields, shown, warnings } : null
}

function plusDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Builds the whole plan for one course from what Canvas holds. Pure apart from the reads. */
export async function planCourse(client: CanvasLMS, courseId: string, label: string, req: TermRequest, note: (l: string) => void): Promise<{ plan: Plan; problems: string[] }> {
  const c = `/api/v1/courses/${courseId}`
  const term: TermShape = { zone: req.timezone, firstMonday: req.firstMonday, breakWeek: req.breakWeek }
  const days = req.oldFirstMonday ? daysBetween(req.oldFirstMonday, req.firstMonday, req.timezone) : 0
  const plan: Plan = { changes: [], ops: new Map() }
  const problems: string[] = []

  const add = (change: ProposedChange, ops: Op[]) => {
    plan.changes.push(change)
    plan.ops.set(change.id, ops)
  }

  const attempt = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (error) {
      problems.push(`${what}: ${plainError(error)}`)
    }
  }

  if (req.shiftDates && days !== 0) {
    await attempt('Assignments', async () => {
      note('Reading assignments')
      const list = await client.listJson(`${c}/assignments`, { override_assignment_dates: 'false' })
      for (const a of list) {
        const s = shiftObject(a, ASSIGNMENT_DATES, days, req)
        if (!s) continue
        if (a.has_overrides === true) s.warnings.push('Has section or student dates. Those are not moved in this version: check them in Canvas.')
        const id = `${courseId}:assignment:${str(a.id)}`
        add(
          { id, courseId, courseLabel: label, kind: 'assignment', objectTitle: str(a.name), visible: a.published === true, fields: s.shown, warnings: s.warnings },
          [{ type: 'update', id, courseId, label: `${label}: ${str(a.name)}`, getPath: `${c}/assignments/${str(a.id)}?override_assignment_dates=false`, putPath: `${c}/assignments/${str(a.id)}`, fields: s.fields }],
        )
      }
    })
    await attempt('Discussions', async () => {
      note('Reading discussions')
      for (const t of await client.listDiscussions(courseId)) {
        if (t.assignment_id) continue // graded: its dates are the assignment's, moved above
        const s = shiftObject(t, TOPIC_DATES, days, req)
        if (!s) continue
        const id = `${courseId}:discussion:${str(t.id)}`
        add(
          { id, courseId, courseLabel: label, kind: 'discussion', objectTitle: str(t.title), visible: t.published === true, fields: s.shown, warnings: s.warnings },
          [{ type: 'update', id, courseId, label: `${label}: ${str(t.title)}`, getPath: `${c}/discussion_topics/${str(t.id)}`, putPath: `${c}/discussion_topics/${str(t.id)}`, fields: s.fields }],
        )
      }
    })
    await attempt('Quizzes', async () => {
      note('Reading quizzes')
      for (const q of await client.listQuizzes(courseId)) {
        if (q.assignment_id) continue // graded: moved with its assignment
        const s = shiftObject(q, QUIZ_DATES, days, req)
        if (!s) continue
        const id = `${courseId}:quiz:${str(q.id)}`
        add(
          { id, courseId, courseLabel: label, kind: 'quiz', objectTitle: str(q.title), visible: q.published === true, fields: s.shown, warnings: s.warnings },
          [{ type: 'update', id, courseId, label: `${label}: ${str(q.title)}`, getPath: `${c}/quizzes/${str(q.id)}`, putPath: `${c}/quizzes/${str(q.id)}`, fields: s.fields }],
        )
      }
    })
  }

  if (req.setModuleUnlock || req.dateModuleTitles || req.addHolidayHeaders) {
    await attempt('Modules', async () => {
      note('Reading modules')
      const modules = await client.listModules(courseId)
      const byWeek = new Map<number, Payload>()
      for (const m of modules) {
        const name = str(m.name)
        const week = moduleWeek(name)
        if (week === null) continue
        if (!byWeek.has(week)) byWeek.set(week, m)
        const fields: OpField[] = []
        const shown: ProposedChange['fields'] = []
        if (req.dateModuleTitles) {
          const next = datedTitle(name, week, term)
          if (next !== name) {
            fields.push({ key: 'module[name]', read: 'name', before: name, after: next, kind: 'text' })
            shown.push({ field: 'name', label: 'Title', beforeText: name, afterText: next })
          }
        }
        if (req.setModuleUnlock) {
          const before = opt(m.unlock_at)
          const after = weekStart(week, term).toUTC().toISO({ suppressMilliseconds: true }) as string
          if (!before || Date.parse(before) !== Date.parse(after)) {
            fields.push({ key: 'module[unlock_at]', read: 'unlock_at', before, after, kind: 'date' })
            shown.push({ field: 'unlock_at', label: 'Unlocks', beforeText: showDate(before, req.timezone), afterText: showDate(after, req.timezone) })
          }
        }
        if (!fields.length) continue
        const id = `${courseId}:module:${str(m.id)}`
        add(
          { id, courseId, courseLabel: label, kind: 'module', objectTitle: name, visible: m.published === true, fields: shown, warnings: [] },
          [{ type: 'update', id, courseId, label: `${label}: ${name}`, getPath: `${c}/modules/${str(m.id)}`, putPath: `${c}/modules/${str(m.id)}`, fields }],
        )
      }

      if (req.addHolidayHeaders) {
        const headers: Array<{ text: string; week: number; atEnd: boolean }> = []
        for (const h of req.holidays) {
          const week = weekOf(h.start, term)
          if (week !== null) headers.push({ text: `${h.label}: ${rangeLabel(h.start, h.end, req.timezone)}`, week, atEnd: false })
        }
        if (req.breakWeek) {
          const before = weekOf(plusDays(req.breakWeek, -1), term)
          if (before !== null) headers.push({ text: `Break: ${rangeLabel(req.breakWeek, plusDays(req.breakWeek, 4), req.timezone)}. No work is due.`, week: before, atEnd: true })
        }
        for (const h of headers) {
          const m = byWeek.get(h.week)
          if (!m) continue
          const moduleId = str(m.id)
          const items = await client.listModuleItems(courseId, moduleId)
          if (items.some((it) => it.type === 'SubHeader' && str(it.title) === h.text)) continue
          const position = h.atEnd ? items.length + 1 : 1
          const id = `${courseId}:header:${moduleId}:${h.text}`
          add(
            {
              id, courseId, courseLabel: label, kind: 'moduleItem', objectTitle: str(m.name), visible: m.published === true,
              fields: [{ field: 'header', label: h.atEnd ? 'New header at the end' : 'New header at the top', beforeText: '', afterText: h.text }],
              warnings: [],
            },
            [{
              type: 'create', id, courseId, label: `${label}: header in ${str(m.name)}`,
              postPath: `${c}/modules/${moduleId}/items`,
              data: [['module_item[type]', 'SubHeader'], ['module_item[title]', h.text], ['module_item[position]', String(position)]],
              undoPath: `${c}/modules/${moduleId}/items/{id}`,
            }],
          )
        }
      }
    })
  }

  return { plan, problems }
}

export async function preview(client: CanvasLMS, req: TermRequest, progress: (done: number, total: number, label: string) => void): Promise<Preview> {
  const changes: ProposedChange[] = []
  const problems: Preview['problems'] = []
  const ops = new Map<string, Op[]>()
  for (let i = 0; i < req.courseIds.length; i++) {
    const courseId = req.courseIds[i]
    const label = req.courseLabels[courseId] ?? courseId
    progress(i, req.courseIds.length, `Reading ${label}`)
    const { plan, problems: found } = await planCourse(client, courseId, label, req, (l) => progress(i, req.courseIds.length, `${label}: ${l}`))
    for (const message of found) problems.push({ courseLabel: label, message })
    changes.push(...plan.changes)
    for (const [k, v] of plan.ops) ops.set(k, v)
  }
  progress(req.courseIds.length, req.courseIds.length, 'Done')
  const previewId = keepPreview(ops, req.courseIds.map((id) => req.courseLabels[id] ?? id))
  return { previewId, changes, problems }
}
