/**
 * "Which courses are you working on?" The Course Picker from Canvas Extractor Tools 1.2.0
 * (CoursePicker.tsx), extended to choose several courses at once:
 *
 * Kept from the Extractor: paste a course address, or open "Choose from my courses" for a list
 * you can search by name or code, grouped by term (masters and templates first, newest term next,
 * ended courses marked), with the same role badges and the same note under the list.
 *
 * New here: a checkbox on each course; an "Every course in this term" box under each term heading
 * that shows a dash when only some are ticked (the Extractor's "Everything in this module" rule,
 * from pickerSelection.ts); several addresses, one per line; saved groups; and a tray of the
 * courses chosen so far.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
import type { CourseChoice, SavedGroup, SessionCourse } from '../shared/api'
import { countCourses, NO_TERM_GROUP, siteHost, visibleGroups } from '../lib/courseFilter'
import { groupState } from '../lib/pickerSelection'
import { Button, Callout, cleanError } from './ui'

const ROLE_STYLE = {
  teacher: 'bg-indigo-100 text-indigo-900',
  ta: 'bg-amber-100 text-amber-900',
  designer: 'bg-green-100 text-green-900',
} as const

export const courseLabel = (c: SessionCourse): string => c.code || c.name

const toSession = (c: CourseChoice): SessionCourse => ({ id: c.id, name: c.name, code: c.code, term: c.term })

function TermBox({ ids, selected, term, onChange }: { ids: string[]; selected: Set<string>; term: string; onChange(on: boolean): void }) {
  const ref = useRef<HTMLInputElement>(null)
  const state = groupState(ids, selected)
  const count = ids.filter((i) => selected.has(i)).length
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return (
    <label className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-bold border-b border-gray-100 cursor-pointer hover:bg-gray-50">
      <input ref={ref} type="checkbox" className="w-3.5 h-3.5 accent-brand" checked={state === 'all'} onChange={(e) => onChange(e.target.checked)} aria-label={`Every course in ${term}`} />
      <span>Every course in this term</span>
      <span className="ml-auto font-normal text-[11px] text-gray-600 tabular-nums">{count} of {ids.length} selected</span>
    </label>
  )
}

interface Props {
  initial: SessionCourse[]
  groups: SavedGroup[]
  onGroupsChange(groups: SavedGroup[]): void
  onDone(courses: SessionCourse[]): void
  onCancel(): void
}

export function CoursePicker({ initial, groups, onGroupsChange, onDone, onCancel }: Props) {
  const id = useId()
  const [chosen, setChosen] = useState<SessionCourse[]>(initial)
  const [open, setOpen] = useState(true)
  const [courses, setCourses] = useState<CourseChoice[] | null>(null)
  const [site, setSite] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [addresses, setAddresses] = useState('')
  const [checking, setChecking] = useState(false)
  const [pasted, setPasted] = useState<Array<{ address: string; ok: boolean; text: string }>>([])
  const [naming, setNaming] = useState(false)
  const [groupName, setGroupName] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => new Set(chosen.map((c) => c.id)), [chosen])

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('textarea, input, button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  useEffect(() => {
    if (!open || courses || loading) return
    setLoading(true)
    window.api.courses
      .list()
      .then((res) => {
        if (res.ok) {
          setCourses(res.courses)
          setSite(res.site)
        } else setError(res.message)
      })
      .catch((e) => setError(cleanError(e)))
      .finally(() => setLoading(false))
  }, [open, courses, loading])

  const groupsShown = courses ? visibleGroups(courses, query) : []
  const shown = countCourses(groupsShown)

  const toggle = (c: SessionCourse, on: boolean) =>
    setChosen((prev) => (on ? (prev.some((p) => p.id === c.id) ? prev : [...prev, c]) : prev.filter((p) => p.id !== c.id)))

  const checkAddresses = async () => {
    const lines = addresses.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return
    setChecking(true)
    try {
      const res = await window.api.courses.resolve(lines)
      if (!Array.isArray(res)) {
        setPasted([{ address: '', ok: false, text: (res as { message: string }).message }])
        return
      }
      setPasted(res.map((r) => (r.ok ? { address: r.address, ok: true, text: `${r.course.name}${r.course.code ? ` · ${r.course.code}` : ''}` } : { address: r.address, ok: false, text: r.message })))
      for (const r of res) if (r.ok) toggle(r.course, true)
      setAddresses(res.filter((r) => !r.ok).map((r) => r.address).join('\n'))
    } catch (e) {
      setPasted([{ address: '', ok: false, text: cleanError(e) }])
    } finally {
      setChecking(false)
    }
  }

  const saveGroup = async () => {
    const name = groupName.trim()
    if (!name || chosen.length === 0) return
    onGroupsChange(await window.api.session.saveGroup({ name, courses: chosen }))
    setNaming(false)
    setGroupName('')
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-full flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-gray-200">
          <h2 id={`${id}-title`} className="text-lg font-bold">Which courses are you working on?</h2>
          <p className="text-[13px] text-gray-600">Choose one course, or several to change them together.</p>
        </div>

        <div className="px-5 py-3 overflow-auto grid gap-3 min-h-0">
          <label htmlFor={`${id}-addr`} className="grid gap-1 text-[13px] font-bold">
            Canvas course addresses
            <span className="font-normal text-xs text-gray-600">One per line. Copy each from your browser's address bar on the course home page.</span>
            <textarea
              id={`${id}-addr`}
              value={addresses}
              onChange={(e) => setAddresses(e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder={`${site || 'https://boisestatecanvas.instructure.com'}/courses/12345`}
              className="border-2 border-gray-400 rounded-lg px-2.5 py-1.5 font-mono text-[12.5px] font-normal focus:outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand"
            />
          </label>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-gray-600">Each address is checked with Canvas before it is added.</span>
            <Button variant="ghost" onClick={checkAddresses} disabled={checking || !addresses.trim()}>
              {checking ? 'Checking…' : 'Check and add'}
            </Button>
          </div>
          {pasted.length > 0 && (
            <ul className="grid gap-1 text-[13px]" aria-live="polite">
              {pasted.map((p, i) => (
                <li key={i} className={p.ok ? 'text-green-800' : 'text-red-800'}>
                  {p.ok ? '✓ Added: ' : '✗ '}
                  {p.ok ? <b>{p.text}</b> : <>{p.address && <span className="font-mono text-xs">{p.address}</span>} {p.text}</>}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border-2 border-brand text-brand hover:bg-brand-tint font-black text-sm px-4 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Choose from my courses {open ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
          </button>

          {open && (
            <div className="rounded-xl border-2 border-gray-200 overflow-hidden">
              <div className="p-2.5 bg-gray-50 border-b border-gray-200">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by course name or code"
                  aria-label="Search your courses"
                  spellCheck={false}
                  className="w-full border-2 border-gray-500 rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand"
                />
              </div>
              <div className="px-3 py-2 text-xs text-gray-700 border-b border-gray-200">
                Canvas site: <b>{site ? siteHost(site) : '…'}</b> · change it in Initial setup
              </div>
              {groups.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-200 flex flex-wrap items-center gap-2 text-xs text-gray-700">
                  Saved groups:
                  {groups.map((g) => (
                    <span key={g.name} className="inline-flex items-center rounded-lg border border-dashed border-brand bg-brand-tint text-brand font-bold">
                      <button type="button" className="px-2.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-l-lg" onClick={() => setChosen(g.courses)}>
                        {g.name} ({g.courses.length})
                      </button>
                      <button type="button" aria-label={`Delete the group ${g.name}`} className="px-1.5 py-1 hover:text-red-700" onClick={async () => onGroupsChange(await window.api.session.deleteGroup(g.name))}>
                        <X className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="max-h-[300px] overflow-auto" role="region" aria-label="Your courses">
                {loading && (
                  <p role="status" className="p-3.5 text-[13px] text-gray-700 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Loading your courses…
                  </p>
                )}
                {error && <div className="p-3"><Callout tone="bad">{error}</Callout></div>}
                {courses && shown === 0 && (
                  <p className="p-3.5 text-[13px] text-gray-700">
                    {courses.length === 0 ? 'No courses were found where you are a teacher, TA or designer on this site. Paste a course address instead.' : 'No courses match. Try fewer words.'}
                  </p>
                )}
                {groupsShown.map((g, gi) => (
                  <div key={g.term + g.ended} role="group" aria-labelledby={`${id}-term-${gi}`}>
                    <div id={`${id}-term-${gi}`} className="sticky top-0 z-10 bg-[#dbe7fb] text-[#0a2a6b] text-[12px] font-black uppercase tracking-wider px-3 py-1.5">
                      {g.term}
                      <span className="ml-2 font-normal normal-case tracking-normal">
                        {g.term === NO_TERM_GROUP ? 'master and template courses · ' : g.ended ? 'ended · ' : ''}
                        {g.courses.length}
                      </span>
                    </div>
                    <TermBox
                      ids={g.courses.map((c) => c.id)}
                      selected={selected}
                      term={g.term}
                      onChange={(on) => setChosen((prev) => (on ? [...prev, ...g.courses.filter((c) => !selected.has(c.id)).map(toSession)] : prev.filter((p) => !g.courses.some((c) => c.id === p.id))))}
                    />
                    {g.courses.map((c) => (
                      <label key={c.id} className={`flex items-center gap-2.5 border-t border-gray-100 px-3 py-2 cursor-pointer hover:bg-blue-50 ${selected.has(c.id) ? 'bg-blue-50' : ''}`}>
                        <input type="checkbox" className="w-4 h-4 accent-brand" checked={selected.has(c.id)} onChange={(e) => toggle(toSession(c), e.target.checked)} />
                        <span className="flex-1 min-w-0">
                          <b className="block text-[13.5px]">{c.name}</b>
                          {c.code && <small className="text-xs text-gray-600">{c.code}</small>}
                        </span>
                        {c.blueprint && <span className="text-[11px] font-black rounded-full px-2 py-0.5 bg-gray-100 text-gray-800">Template</span>}
                        <span className={`text-[11px] font-black rounded-full px-2 py-0.5 ${ROLE_STYLE[c.role]}`}>{c.roleLabel || c.role}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {open && courses && (
            <p className="text-xs text-gray-600" role="status">
              Showing {shown} course{shown === 1 ? '' : 's'} where you are a teacher, TA or designer. Student courses are not listed.
            </p>
          )}
        </div>

        <div className="border-t border-gray-200 bg-gray-50 px-5 py-3 grid gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-gray-700 min-h-7" aria-live="polite">
            {chosen.length === 0 ? (
              'No courses selected yet.'
            ) : (
              <>
                <b className="text-gray-900">{chosen.length} selected:</b>
                {chosen.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 bg-white border border-gray-300 rounded-full pl-2.5 pr-1 py-0.5 font-semibold text-gray-900">
                    {courseLabel(c)}
                    <button type="button" aria-label={`Remove ${c.name}`} onClick={() => toggle(c, false)} className="w-5 h-5 grid place-items-center rounded-full hover:bg-gray-100">
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {chosen.length > 1 && <Button variant="link" onClick={() => setChosen([])}>Clear all</Button>}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {naming ? (
              <span className="flex items-center gap-2">
                <input
                  autoFocus
                  aria-label="Group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveGroup()}
                  placeholder="e.g. CS 221 · all sections"
                  className="border-2 border-gray-400 rounded-lg px-2 py-1 text-[13px] focus:outline-none focus:border-brand"
                />
                <Button variant="link" onClick={saveGroup} disabled={!groupName.trim()}>Save group</Button>
                <Button variant="link" onClick={() => setNaming(false)}>Cancel</Button>
              </span>
            ) : (
              <Button variant="link" onClick={() => setNaming(true)} disabled={chosen.length === 0}>Save these as a group…</Button>
            )}
            <span className="flex gap-2">
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
              <Button onClick={() => onDone(chosen)} disabled={chosen.length === 0}>
                {chosen.length > 1 ? `Work on ${chosen.length} courses` : 'Work on 1 course'}
              </Button>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
