/**
 * Whole tools against the pretend Canvas: search, apply only what was ticked, undo, and the
 * "left alone because it changed in Canvas" rule.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FindRequest, TermRequest } from '../src/shared/api'
import { search } from '../electron/ipc/findReplace'
import { listHistory, readBackup, record, takePreview } from '../electron/ipc/history'
import { runOps, undoOps } from '../electron/ipc/ops'
import { listRubrics, rubricOps } from '../electron/ipc/rubrics'
import { setDataDir } from '../electron/ipc/store'
import { preview as termPreview } from '../electron/ipc/termSetup'
import { emptyCourse, fakeCanvas, type FakeCourse } from './fakeCanvas'

const OLD = 'https://helpdesk.boisestate.edu/canvas-student-guide'
const NEW = 'https://www.boisestate.edu/ecampus/canvas-help'
const noop = () => {}

beforeEach(() => {
  // A fresh data folder each test, with a stand-in for the OS keychain.
  setDataDir(mkdtempSync(join(tmpdir(), 'edutools-test-')), {
    available: () => true,
    encrypt: (t) => Buffer.from(t),
    decrypt: (b) => b.toString(),
  })
})

function twoCourses(): Record<string, FakeCourse> {
  const a = emptyCourse()
  a.pages.push(
    { page_id: 10, title: 'Start Here: Getting help', published: true, body: `<p>Help: <a href="${OLD}">guide</a></p>` },
    { page_id: 11, title: 'Week 5 overview', published: false, body: '<p>Complete Lab 5 by Sunday.</p>' },
  )
  a.assignments.push({ id: 20, name: 'Lab 5: Password hashing', published: true, description: `<p>See ${OLD}</p>`, submission_types: ['online_upload'] })
  a.syllabus = `<p>Tech support: <a href="${OLD}">here</a></p>`
  const b = emptyCourse()
  b.pages.push({ page_id: 30, title: 'Start Here', published: true, body: `<a href="${OLD}">help</a>` })
  return { '1': a, '2': b }
}

const findReq = (over: Partial<FindRequest> = {}): FindRequest => ({
  jobId: 'j', courseIds: ['1', '2'], courseLabels: { '1': 'CS 221-001', '2': 'CS 221-002' },
  mode: 'link', find: OLD, replace: NEW, scopes: ['pages', 'assignments', 'syllabus'],
  matchLongerLinks: false, caseSensitive: false, ...over,
})

describe('find and replace', () => {
  it('finds a link in every selected course and changes only what was ticked', async () => {
    const courses = twoCourses()
    const { client } = fakeCanvas(courses)
    const preview = await search(client, findReq(), noop)
    expect(preview.changes.map((c) => c.id).sort()).toEqual(['1:assignment:20', '1:page:10', '1:syllabus:1', '2:page:30'])
    expect(preview.changes.find((c) => c.id === '1:page:10')?.fields[0].afterText).toContain(NEW)

    const kept = takePreview(preview.previewId)!
    const ticked = ['1:page:10', '1:syllabus:1', '2:page:30']
    const { outcomes, applied } = await runOps(client, ticked.flatMap((id) => kept.ops.get(id)!), { htmlMarker: kept.htmlMarker })
    expect(outcomes.every((o) => o.ok)).toBe(true)
    expect(courses['1'].pages[0].body).toContain(NEW)
    expect(courses['1'].syllabus).toContain(NEW)
    expect(courses['2'].pages[0].body).toContain(NEW)
    expect(courses['1'].assignments[0].description).toContain(OLD) // not ticked

    // Undo puts every one back.
    const undo = await runOps(client, undoOps(applied))
    expect(undo.outcomes.every((o) => o.ok)).toBe(true)
    expect(courses['1'].pages[0].body).toBe(`<p>Help: <a href="${OLD}">guide</a></p>`)
    expect(courses['2'].pages[0].body).toBe(`<a href="${OLD}">help</a>`)
  })

  it('leaves alone anything changed in Canvas after the preview', async () => {
    const courses = twoCourses()
    const { client } = fakeCanvas(courses)
    const preview = await search(client, findReq({ courseIds: ['1'] }), noop)
    courses['1'].pages[0].body = '<p>Someone rewrote this page meanwhile.</p>'
    const kept = takePreview(preview.previewId)!
    const { outcomes } = await runOps(client, kept.ops.get('1:page:10')!)
    expect(outcomes[0].ok).toBe(false)
    expect(outcomes[0].message).toMatch(/changed in Canvas after the preview/)
    expect(courses['1'].pages[0].body).toBe('<p>Someone rewrote this page meanwhile.</p>')
  })

  it('does not undo over an edit made after the change', async () => {
    const courses = twoCourses()
    const { client } = fakeCanvas(courses)
    const preview = await search(client, findReq({ courseIds: ['2'] }), noop)
    const kept = takePreview(preview.previewId)!
    const { applied } = await runOps(client, kept.ops.get('2:page:30')!)
    courses['2'].pages[0].body = '<p>Edited again by hand.</p>'
    const undo = await runOps(client, undoOps(applied))
    expect(undo.outcomes[0].ok).toBe(false)
    expect(courses['2'].pages[0].body).toBe('<p>Edited again by hand.</p>')
  })

  it('renames an assignment and the places that mention it', async () => {
    const courses = twoCourses()
    const { client } = fakeCanvas(courses)
    const preview = await search(client, findReq({ courseIds: ['1'], mode: 'title', find: 'Lab 5', replace: 'Lab 6', scopes: ['titles', 'pages', 'assignments'] }), noop)
    const kept = takePreview(preview.previewId)!
    await runOps(client, [...kept.ops.values()].flat(), { htmlMarker: kept.htmlMarker })
    expect(courses['1'].assignments[0].name).toBe('Lab 6: Password hashing')
    expect(courses['1'].pages[1].body).toBe('<p>Complete Lab 6 by Sunday.</p>')
  })

  it('keeps a backup in Recent changes that undo can read', async () => {
    const courses = twoCourses()
    const { client } = fakeCanvas(courses)
    const preview = await search(client, findReq({ courseIds: ['2'] }), noop)
    const kept = takePreview(preview.previewId)!
    const { outcomes, applied } = await runOps(client, kept.ops.get('2:page:30')!)
    const entry = record({ tool: 'Find and replace', title: 'Help link', courses: kept.courses, outcomes, applied, summaryWords: 'items changed' })
    expect(listHistory()[0]).toMatchObject({ id: entry.id, status: 'done', undoable: true, summary: '1 items changed' })
    expect(readBackup(entry.id)?.applied).toHaveLength(1)
  })
})

describe('term setup', () => {
  function termCourse(): FakeCourse {
    const c = emptyCourse()
    c.assignments.push({ id: 20, name: 'Lab 5', published: true, due_at: '2026-02-16T06:59:00Z', unlock_at: null, lock_at: '2026-02-18T06:59:00Z', submission_types: ['online_upload'] })
    c.assignments.push({ id: 21, name: 'Lab 10', published: true, due_at: '2026-03-30T05:59:00Z', submission_types: ['online_upload'] })
    c.modules.push(
      { id: 1, name: 'Start Here', unlock_at: null, items: [] },
      { id: 5, name: 'Module 5: Firewalls (February 9 – February 15)', unlock_at: null, items: [] },
      { id: 2, name: 'Module 2: Basics', unlock_at: null, items: [] },
      { id: 10, name: 'Module 10: Detection', unlock_at: null, items: [{ id: 1, type: 'Page', title: 'Overview' }] },
    )
    return c
  }

  const req: TermRequest = {
    jobId: 't', courseIds: ['1'], courseLabels: { '1': 'CS 221-001' }, timezone: 'America/Boise',
    firstMonday: '2027-01-11', oldFirstMonday: '2026-01-12', breakWeek: '2027-03-22',
    holidays: [{ label: 'No class: MLK Day', start: '2027-01-18', end: '2027-01-18' }],
    shiftDates: true, setModuleUnlock: true, dateModuleTitles: true, addHolidayHeaders: true,
  }

  it('moves dates, dates module titles, sets unlocks and adds headers', async () => {
    const courses = { '1': termCourse() }
    const { client } = fakeCanvas(courses)
    const preview = await termPreview(client, req, noop)
    const lab10 = preview.changes.find((c) => c.objectTitle === 'Lab 10')!
    expect(lab10.warnings.join(' ')).toMatch(/break week/)

    const kept = takePreview(preview.previewId)!
    const { outcomes } = await runOps(client, [...kept.ops.values()].flat())
    expect(outcomes.filter((o) => !o.ok)).toEqual([])

    const c = courses['1']
    expect(c.assignments[0].due_at).toBe('2027-02-15T06:59:00Z')
    expect(c.modules[1].name).toBe('Module 5: Firewalls (February 8 – February 14)')
    expect(Date.parse(String(c.modules[1].unlock_at))).toBe(Date.parse('2027-02-08T07:00:00Z'))
    expect(c.modules[0].name).toBe('Start Here') // no week, left alone
    expect(c.modules[2].items[0]).toMatchObject({ type: 'SubHeader', title: 'No class: MLK Day: Monday, January 18' })
    expect(c.modules[3].items.at(-1)).toMatchObject({ type: 'SubHeader', title: 'Break: March 22 – March 26. No work is due.' })

    // A second preview finds nothing new to add: headers are not doubled, titles are not re-dated.
    const again = await termPreview(client, { ...req, shiftDates: false }, noop)
    expect(again.changes).toEqual([])
  })
})

describe('rubrics', () => {
  it('links, swaps and undoes a rubric', async () => {
    const c = emptyCourse()
    c.assignments.push({ id: 20, name: 'Lab 1', published: true, submission_types: ['online_upload'] })
    c.rubrics.push({ id: 7, title: 'Lab Report Rubric', points_possible: 30 }, { id: 8, title: 'Other', points_possible: 10 })
    const courses = { '1': c }
    const { client } = fakeCanvas(courses)

    let list = await listRubrics(client, '1')
    expect(list.rows[0].rubricId).toBeNull()
    let ops = await rubricOps(client, '1', 'CS 221-001', list.rows, [{ assignmentId: '20', fromRubricId: null, rubricId: '7' }])
    const first = await runOps(client, ops)
    expect(first.outcomes[0].ok).toBe(true)

    list = await listRubrics(client, '1')
    expect(list.rows[0].rubricTitle).toBe('Lab Report Rubric')
    ops = await rubricOps(client, '1', 'CS 221-001', list.rows, [{ assignmentId: '20', fromRubricId: '7', rubricId: '8' }])
    const swap = await runOps(client, ops)
    expect((await listRubrics(client, '1')).rows[0].rubricId).toBe('8')

    // Undoing the swap puts rubric 7 back, not nothing.
    await runOps(client, undoOps(swap.applied))
    expect((await listRubrics(client, '1')).rows[0].rubricId).toBe('7')

    // Removing it, then undoing the removal.
    list = await listRubrics(client, '1')
    ops = await rubricOps(client, '1', 'CS 221-001', list.rows, [{ assignmentId: '20', fromRubricId: '7', rubricId: null }])
    const removed = await runOps(client, ops)
    expect((await listRubrics(client, '1')).rows[0].rubricId).toBeNull()
    await runOps(client, undoOps(removed.applied))
    expect((await listRubrics(client, '1')).rows[0].rubricId).toBe('7')
  })
})
