/**
 * Match rubrics to assignments: one course at a time, every assignment with its rubric in a list.
 * Change any dropdown, then Save. Changes are recorded in Recent changes and can be undone.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApplyOutcome, RubricList, SessionCourse } from '../shared/api'
import { courseLabel } from '../components/CoursePicker'
import { Button, Callout, Chip, Panel, cleanError } from '../components/ui'

type Filter = 'all' | 'missing' | 'assignment' | 'discussion' | 'quiz'

export function Rubrics({ courses }: { courses: SessionCourse[] }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [list, setList] = useState<RubricList | null>(null)
  const [choice, setChoice] = useState<Record<string, string | null>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<ApplyOutcome[] | null>(null)

  const course = courses.find((c) => c.id === courseId)

  // The session's courses can change while this screen is open; follow them.
  useEffect(() => {
    if (!courses.some((c) => c.id === courseId)) setCourseId(courses[0]?.id ?? '')
  }, [courses, courseId])

  const load = useCallback(async () => {
    if (!courseId) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.rubrics.list(courseId)
      if (!res.ok) return setError(res.message)
      setList(res.list)
      setChoice(Object.fromEntries(res.list.rows.map((r) => [r.assignmentId, r.rubricId])))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    setList(null)
    setOutcomes(null)
    void load()
  }, [load])

  const changes = useMemo(
    () => (list ? list.rows.filter((r) => (choice[r.assignmentId] ?? null) !== r.rubricId).map((r) => ({ assignmentId: r.assignmentId, fromRubricId: r.rubricId, rubricId: choice[r.assignmentId] ?? null })) : []),
    [list, choice],
  )

  const save = async () => {
    if (!course) return
    setSaving(true)
    setError(null)
    try {
      const res = await window.api.rubrics.save({ courseId, courseLabel: courseLabel(course), changes })
      if (!res.ok) return setError(res.message)
      setOutcomes(res.result.outcomes)
      await load()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setSaving(false)
    }
  }

  const rows = (list?.rows ?? []).filter((r) =>
    filter === 'all' ? true : filter === 'missing' ? !r.rubricId : filter === 'quiz' ? r.type.includes('quiz') : r.type === filter,
  )
  const missing = list?.rows.filter((r) => !r.rubricId && r.graded).length ?? 0

  return (
    <Panel
      title="Match rubrics to assignments"
      actions={courses.length > 1 && (
        <label className="text-[13px] flex items-center gap-2">
          Course
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="border-2 border-gray-400 rounded-lg px-2 py-1 text-[13px] bg-white focus:outline-none focus:border-brand">
            {courses.map((c) => <option key={c.id} value={c.id}>{courseLabel(c)}</option>)}
          </select>
        </label>
      )}
    >
      {error && <Callout tone="bad">{error}</Callout>}
      {outcomes && (outcomes.every((o) => o.ok)
        ? <Callout tone="ok">Saved {outcomes.length} rubric change{outcomes.length === 1 ? '' : 's'} and checked them in Canvas. Undo from Recent changes.</Callout>
        : <Callout tone="warn">{outcomes.filter((o) => !o.ok).map((o) => o.message).join(' ')}</Callout>)}
      {loading && <p className="text-[13px] text-gray-700" role="status">Loading assignments and rubrics…</p>}
      {list && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {([['all', `All ${list.rows.length}`], ['missing', `No rubric (${list.rows.filter((r) => !r.rubricId).length})`], ['assignment', 'Assignments'], ['discussion', 'Discussions'], ['quiz', 'Quizzes']] as Array<[Filter, string]>).map(([f, label]) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-full text-[12.5px] font-semibold border ${filter === f ? 'bg-brand border-brand text-white' : 'bg-white border-gray-300 text-gray-700'}`}>{label}</button>
            ))}
          </div>
          {list.rubrics.length === 0 && <Callout tone="info">This course has no rubrics yet. Create them in Canvas Rubric Creator, then come back to link them.</Callout>}
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-gray-600 border-b border-gray-200">
                  <th className="py-1.5 pr-3" scope="col">Item</th>
                  <th className="py-1.5 pr-3" scope="col">Rubric</th>
                  <th className="py-1.5" scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const current = choice[r.assignmentId] ?? null
                  const changed = current !== r.rubricId
                  return (
                    <tr key={r.assignmentId} className={`border-b border-gray-100 align-top ${changed ? 'bg-blue-50' : ''}`}>
                      <td className="py-2 pr-3"><b>{r.title}</b><div className="text-xs text-gray-600 capitalize">{r.type}{r.published ? '' : ' · hidden'}</div></td>
                      <td className="py-2 pr-3">
                        <select
                          aria-label={`Rubric for ${r.title}`}
                          value={current ?? ''}
                          onChange={(e) => setChoice((c) => ({ ...c, [r.assignmentId]: e.target.value || null }))}
                          className={`max-w-full border-2 rounded-lg px-2 py-1 text-[13px] bg-white focus:outline-none focus:border-brand ${!current && r.graded ? 'border-amber-500' : 'border-gray-300'}`}
                        >
                          <option value="">— No rubric —</option>
                          {list.rubrics.map((rb) => <option key={rb.id} value={rb.id}>{rb.title} ({rb.points} pts)</option>)}
                        </select>
                      </td>
                      <td className="py-2 grid gap-1">
                        {!current && r.graded && <Chip tone="warn">Missing</Chip>}
                        {changed && <Chip tone="info">Not saved yet</Chip>}
                        {changed && r.hasSubmissions && <span className="text-xs text-amber-900">Has submissions. Existing scores stay, but old rubric marks are hidden.</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-600">Ungraded discussions cannot have a grading rubric, so they are not listed.{missing ? ` ${missing} graded item${missing === 1 ? ' has' : 's have'} no rubric.` : ''}</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] text-gray-700">{changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} not saved yet` : 'No changes yet'}</span>
            <span className="flex gap-2">
              <Button variant="ghost" onClick={() => setChoice(Object.fromEntries(list.rows.map((r) => [r.assignmentId, r.rubricId])))} disabled={!changes.length || saving}>Reset</Button>
              <Button onClick={save} disabled={!changes.length || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            </span>
          </div>
        </>
      )}
    </Panel>
  )
}
