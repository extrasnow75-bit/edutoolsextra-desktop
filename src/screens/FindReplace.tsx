/**
 * Find and replace across the selected courses, in four steps:
 * Find → Review matches → Replace → Done. Searching only reads Canvas.
 */
import React, { useEffect, useState } from 'react'
import type { ApplyResult, FindMode, FindScope, Preview, Progress, SessionCourse } from '../shared/api'
import { ChangeReview, Outcomes } from '../components/ChangeReview'
import { courseLabel } from '../components/CoursePicker'
import { Button, Callout, Panel, ProgressBar, Steps, TextField, cleanError, newJobId } from '../components/ui'

const MODES: Array<{ id: FindMode; label: string; hint: string; findLabel: string; example: [string, string] }> = [
  { id: 'title', label: 'Rename or renumber', findLabel: 'Find this name', hint: 'Changes the title and every place that mentions it. “Lab 5” will not match “Lab 50”.', example: ['Lab 5', 'Lab 6'] },
  { id: 'link', label: 'Links and videos', findLabel: 'Find this web address', hint: 'Changes links, embedded videos and images that use this address.', example: ['https://old.example.edu/guide', 'https://new.example.edu/guide'] },
  { id: 'text', label: 'Any text', findLabel: 'Find this text', hint: 'Changes words people read. Links and page code are left alone.', example: ['Spring 2026', 'Spring 2027'] },
]

const SCOPES: Array<{ id: FindScope; label: string }> = [
  { id: 'titles', label: 'Titles' },
  { id: 'pages', label: 'Pages' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'discussions', label: 'Discussions' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'quizzes', label: 'Quizzes (Classic)' },
  { id: 'syllabus', label: 'Syllabus' },
  { id: 'moduleItems', label: 'Module item titles' },
]

export function FindReplace({ courses, onChangeCourses, onDone }: { courses: SessionCourse[]; onChangeCourses(): void; onDone(): void }) {
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<FindMode>('title')
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [scopes, setScopes] = useState<Set<FindScope>>(new Set(['titles', 'pages', 'assignments', 'discussions', 'announcements', 'quizzes', 'syllabus', 'moduleItems']))
  const [longer, setLonger] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [jobId, setJobId] = useState('')

  useEffect(() => window.api.onProgress((p) => p.jobId === jobId && setProgress(p)), [jobId])

  const m = MODES.find((x) => x.id === mode)!
  const labels = Object.fromEntries(courses.map((c) => [c.id, courseLabel(c)]))

  const runSearch = async () => {
    setError(null)
    const id = newJobId()
    setJobId(id)
    setProgress(null)
    setStep(1)
    try {
      const res = await window.api.findReplace.search({
        jobId: id, courseIds: courses.map((c) => c.id), courseLabels: labels, mode, find, replace,
        scopes: [...scopes], matchLongerLinks: longer, caseSensitive,
      })
      if (!res.ok) {
        setError(res.message)
        setStep(0)
        return
      }
      setPreview(res.preview)
      setSelected(new Set(res.preview.changes.map((c) => c.id)))
    } catch (e) {
      setError(cleanError(e))
      setStep(0)
    }
  }

  const runApply = async () => {
    if (!preview) return
    setError(null)
    const id = newJobId()
    setJobId(id)
    setProgress(null)
    setStep(2)
    try {
      const res = await window.api.findReplace.apply({ jobId: id, previewId: preview.previewId, changeIds: [...selected], title: `“${find.trim()}” → “${replace.trim()}”` })
      if (!res.ok) {
        setError(res.message)
        setStep(1)
        return
      }
      setResult(res.result)
      setStep(3)
    } catch (e) {
      setError(cleanError(e))
      setStep(1)
    }
  }

  const searching = step === 1 && !preview

  return (
    <Panel title={`Find and replace in ${courses.length} course${courses.length === 1 ? '' : 's'}`}>
      <Steps names={['Find', 'Review matches', 'Replace', 'Done']} at={step} />
      {error && <Callout tone="bad">{error}</Callout>}

      {step === 0 && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            {courses.map((c) => <span key={c.id} className="bg-white border border-gray-300 rounded-full px-2.5 py-0.5 font-semibold">{courseLabel(c)}</span>)}
            <Button variant="link" onClick={onChangeCourses}>Change courses</Button>
          </div>
          <div role="radiogroup" aria-label="What to change" className="inline-flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl w-fit">
            {MODES.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={mode === x.id}
                onClick={() => setMode(x.id)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${mode === x.id ? 'bg-white text-brand shadow' : 'text-gray-600'}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <TextField id="fr-find" label={m.findLabel} value={find} onChange={(e) => setFind(e.target.value)} placeholder={m.example[0]} spellCheck={false} />
            <TextField id="fr-replace" label="Replace it with" value={replace} onChange={(e) => setReplace(e.target.value)} placeholder={m.example[1]} spellCheck={false} />
          </div>
          <p className="text-[12.5px] text-gray-600 -mt-2">{m.hint}</p>
          <fieldset className="grid gap-2">
            <legend className="text-[13px] font-bold mb-1">Where to look</legend>
            <div className="flex flex-wrap gap-2">
              {SCOPES.map((s) => {
                const on = scopes.has(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setScopes((prev) => { const n = new Set(prev); on ? n.delete(s.id) : n.add(s.id); return n })}
                    className={`px-3 py-1 rounded-full text-[12.5px] font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${on ? 'bg-brand border-brand text-white' : 'bg-white border-gray-300 text-gray-700'}`}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-4 text-[13px]">
            {mode === 'link' && (
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand" checked={longer} onChange={(e) => setLonger(e.target.checked)} /> Also change longer links that start with this address</label>
            )}
            {mode !== 'link' && (
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> Match upper and lower case exactly</label>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-gray-600">Searching only reads Canvas. Nothing changes until step 3.</span>
            <Button onClick={runSearch} disabled={!find.trim() || scopes.size === 0 || courses.length === 0}>Find matches →</Button>
          </div>
        </div>
      )}

      {searching && <ProgressBar progress={progress} fallback="Searching…" />}

      {step === 1 && preview && (
        <div className="grid gap-4">
          {preview.changes.length === 0 ? (
            <Callout tone="info">“{find.trim()}” was not found in the selected courses and places. Try fewer words, or turn on more places to look.</Callout>
          ) : (
            <>
              <Callout tone="ok">Found in {preview.changes.length} item{preview.changes.length === 1 ? '' : 's'}. Untick anything you want to leave alone, and use Compare to see each change side by side.</Callout>
              <ChangeReview preview={preview} selected={selected} onSelected={setSelected} />
            </>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="link" onClick={() => { setPreview(null); setStep(0) }}>← Back</Button>
            <Button onClick={runApply} disabled={selected.size === 0}>Replace in {selected.size} item{selected.size === 1 ? '' : 's'} →</Button>
          </div>
        </div>
      )}

      {step === 2 && <ProgressBar progress={progress} fallback="Saving a backup of each item, then changing it…" />}

      {step === 3 && result && (
        <div className="grid gap-4">
          <Outcomes outcomes={result.outcomes} changes={preview?.changes ?? null} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => { setPreview(null); setResult(null); setStep(0) }}>Find something else</Button>
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      )}
    </Panel>
  )
}
