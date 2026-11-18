/**
 * Get ready for teaching, first version: dates typed in (AI-suggested dates come later), then the
 * date tasks, a preview of every change, and apply. The gradebook, Course Questions and broken-link
 * tasks are listed as coming next so the shape of the checklist is already right.
 */
import React, { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { ApplyResult, Holiday, Preview, Progress, SessionCourse } from '../shared/api'
import { ChangeReview, Outcomes } from '../components/ChangeReview'
import { courseLabel } from '../components/CoursePicker'
import { Button, Callout, CheckRow, Chip, Panel, ProgressBar, Steps, TextField, cleanError, newJobId } from '../components/ui'

const ZONES = ['America/Boise', 'America/Denver', 'America/Los_Angeles', 'America/Chicago', 'America/New_York', 'America/Phoenix', 'Pacific/Honolulu', 'America/Anchorage']

const weekday = (d: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return ''
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

function DateField({ id, label, value, onChange, hint, mustBeMonday }: { id: string; label: string; value: string; onChange(v: string): void; hint?: string; mustBeMonday?: boolean }) {
  const day = weekday(value)
  const wrong = mustBeMonday && value && day !== 'Monday'
  return (
    <div className="grid gap-1">
      <TextField id={id} label={label} type="date" value={value} onChange={(e) => onChange(e.target.value)} hint={hint} />
      {value && <span className={`text-xs ${wrong ? 'text-red-700 font-bold' : 'text-gray-600'}`}>{wrong ? `That is a ${day}. Choose the Monday.` : day}</span>}
    </div>
  )
}

export function TermSetup({ courses, onChangeCourses, onDone }: { courses: SessionCourse[]; onChangeCourses(): void; onDone(): void }) {
  const [step, setStep] = useState(0)
  const [termName, setTermName] = useState('')
  const [zone, setZone] = useState('America/Boise')
  const [firstMonday, setFirstMonday] = useState('')
  const [oldFirstMonday, setOldFirstMonday] = useState('')
  const [breakWeek, setBreakWeek] = useState('')
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [tasks, setTasks] = useState({ shiftDates: true, setModuleUnlock: true, dateModuleTitles: true, addHolidayHeaders: true })
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [jobId, setJobId] = useState('')

  useEffect(() => window.api.onProgress((p) => p.jobId === jobId && setProgress(p)), [jobId])

  const isMonday = (d: string) => weekday(d) === 'Monday'
  const datesOk = isMonday(firstMonday) && (!oldFirstMonday || isMonday(oldFirstMonday)) && (!breakWeek || isMonday(breakWeek)) && holidays.every((h) => h.label.trim() && h.start)
  const shiftDays = firstMonday && oldFirstMonday ? Math.round((Date.parse(firstMonday) - Date.parse(oldFirstMonday)) / 86_400_000) : 0
  const anyTask = Object.values(tasks).some(Boolean)

  const runPreview = async () => {
    setError(null)
    const id = newJobId()
    setJobId(id)
    setProgress(null)
    setPreview(null)
    setStep(2)
    try {
      const res = await window.api.term.preview({
        jobId: id, courseIds: courses.map((c) => c.id), courseLabels: Object.fromEntries(courses.map((c) => [c.id, courseLabel(c)])),
        timezone: zone, firstMonday, oldFirstMonday, breakWeek, holidays: holidays.map((h) => ({ ...h, end: h.end || h.start })),
        ...tasks, shiftDates: tasks.shiftDates && Boolean(oldFirstMonday),
      })
      if (!res.ok) {
        setError(res.message)
        setStep(1)
        return
      }
      setPreview(res.preview)
      setSelected(new Set(res.preview.changes.map((c) => c.id)))
    } catch (e) {
      setError(cleanError(e))
      setStep(1)
    }
  }

  const runApply = async () => {
    if (!preview) return
    const id = newJobId()
    setJobId(id)
    setProgress(null)
    setStep(3)
    try {
      const res = await window.api.term.apply({ jobId: id, previewId: preview.previewId, changeIds: [...selected], title: `Ready for ${termName.trim() || 'the new term'}` })
      if (!res.ok) {
        setError(res.message)
        setStep(2)
        return
      }
      setResult(res.result)
    } catch (e) {
      setError(cleanError(e))
      setStep(2)
    }
  }

  return (
    <Panel title="Get ready for teaching">
      <Steps names={['Term dates', 'Choose tasks', 'Preview', 'Apply']} at={step} />
      {error && <Callout tone="bad">{error}</Callout>}

      {step === 0 && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            {courses.map((c) => <span key={c.id} className="bg-white border border-gray-300 rounded-full px-2.5 py-0.5 font-semibold">{courseLabel(c)}</span>)}
            <Button variant="link" onClick={onChangeCourses}>Change courses</Button>
          </div>
          <Callout tone="info">Type the dates from the academic calendar. Suggesting them automatically comes in a later version.</Callout>
          <div className="grid sm:grid-cols-2 gap-3">
            <TextField id="t-name" label="Term name" value={termName} onChange={(e) => setTermName(e.target.value)} placeholder="Spring 2027" hint="Only used to name this change in Recent changes." />
            <label htmlFor="t-zone" className="grid gap-1 text-[13px] font-bold text-gray-800">
              Course time zone
              <select id="t-zone" value={zone} onChange={(e) => setZone(e.target.value)} className="border-2 border-gray-400 rounded-lg px-2.5 py-1.5 font-normal text-[13px] bg-white focus:outline-none focus:border-brand">
                {ZONES.map((z) => <option key={z}>{z}</option>)}
              </select>
            </label>
            <DateField id="t-first" label="First day of classes (a Monday)" value={firstMonday} onChange={setFirstMonday} mustBeMonday />
            <DateField id="t-old" label="First Monday of the term these courses were copied from" value={oldFirstMonday} onChange={setOldFirstMonday} mustBeMonday hint="Leave empty if you only want module dates and headers, not moved due dates." />
            <DateField id="t-break" label="Break week, if any (its Monday)" value={breakWeek} onChange={setBreakWeek} mustBeMonday hint="For example Spring Break. Week numbering skips it." />
          </div>
          {shiftDays !== 0 && <p className="text-[13px] text-gray-800">Due dates will move <b>{shiftDays} days</b> ({(shiftDays / 7).toFixed(shiftDays % 7 ? 1 : 0)} weeks), keeping the same time of day.</p>}
          <fieldset className="grid gap-2">
            <legend className="text-[13px] font-bold mb-1">Holidays to mark in modules</legend>
            {holidays.map((h, i) => (
              <div key={i} className="grid sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end">
                <TextField id={`h-l-${i}`} label="Label" value={h.label} placeholder="No class: MLK Day" onChange={(e) => setHolidays((hs) => hs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <TextField id={`h-s-${i}`} label="First day" type="date" value={h.start} onChange={(e) => setHolidays((hs) => hs.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                <TextField id={`h-e-${i}`} label="Last day (optional)" type="date" value={h.end} onChange={(e) => setHolidays((hs) => hs.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                <button type="button" aria-label={`Remove ${h.label || 'this holiday'}`} onClick={() => setHolidays((hs) => hs.filter((_, j) => j !== i))} className="p-2 mb-0.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" aria-hidden="true" /></button>
              </div>
            ))}
            <div><Button variant="link" onClick={() => setHolidays((hs) => [...hs, { label: '', start: '', end: '' }])}><Plus className="inline w-3.5 h-3.5 -mt-0.5" aria-hidden="true" /> Add a holiday</Button></div>
          </fieldset>
          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} disabled={!datesOk || courses.length === 0}>Dates look right →</Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-2.5">
          <CheckRow id="tk-shift" checked={tasks.shiftDates && Boolean(oldFirstMonday)} disabled={!oldFirstMonday} onChange={(v) => setTasks({ ...tasks, shiftDates: v })}
            title="Move due, available-from and until dates to the new term"
            detail={oldFirstMonday ? `Every date moves ${shiftDays} days and keeps its time of day. Section or student dates are listed, not moved.` : 'Needs the first Monday of the old term, on the previous step.'} />
          <CheckRow id="tk-unlock" checked={tasks.setModuleUnlock} onChange={(v) => setTasks({ ...tasks, setModuleUnlock: v })}
            title="Set module unlock dates" detail="A module named “Module 5” or “Week 5” opens at 12:00 AM on that week's Monday. Modules without a week number are left alone." />
          <CheckRow id="tk-titles" checked={tasks.dateModuleTitles} onChange={(v) => setTasks({ ...tasks, dateModuleTitles: v })}
            title="Add dates to module titles" detail="eCampus style: “Module 5: Firewalls (February 8 – February 14)”. Dates already in a title are replaced, not doubled." />
          <CheckRow id="tk-hol" checked={tasks.addHolidayHeaders} onChange={(v) => setTasks({ ...tasks, addHolidayHeaders: v })}
            title="Insert holiday markers" detail="A text header in the module for each holiday's week, and one at the end of the module before the break." />
          <CheckRow id="tk-gb" checked={false} disabled onChange={() => {}} title="Set up the gradebook" badge={<Chip>Coming next</Chip>} detail="Arrange by name, show Notes, hide unpublished items. Needs checking: these may be personal settings." />
          <CheckRow id="tk-cq" checked={false} disabled onChange={() => {}} title="Subscribe to “Course Questions”" badge={<Chip>Coming next</Chip>} detail="Canvas subscribes whoever runs the tool, so instructors would run this step themselves." />
          <CheckRow id="tk-links" checked={false} disabled onChange={() => {}} title="Check for broken links" badge={<Chip>Coming next</Chip>} detail="Runs Canvas's Course Link Validator in each course." />
          <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
            <Button variant="link" onClick={() => setStep(0)}>← Back</Button>
            <Button onClick={runPreview} disabled={!anyTask}>Preview changes →</Button>
          </div>
        </div>
      )}

      {step === 2 && !preview && <ProgressBar progress={progress} fallback="Reading the courses…" />}

      {step === 2 && preview && (
        <div className="grid gap-4">
          {preview.changes.length === 0 ? (
            <Callout tone="info">Nothing to change: these courses already match the dates you entered.</Callout>
          ) : (
            <>
              <Callout tone="ok">Preview only: nothing has changed yet. {preview.changes.length} items would change. Untick anything to leave as it is.</Callout>
              <ChangeReview preview={preview} selected={selected} onSelected={setSelected} compareLabels={{ left: 'Now', right: 'After setup' }} />
            </>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="link" onClick={() => setStep(1)}>← Back</Button>
            <Button onClick={runApply} disabled={selected.size === 0}>Apply {selected.size} change{selected.size === 1 ? '' : 's'} →</Button>
          </div>
        </div>
      )}

      {step === 3 && !result && <ProgressBar progress={progress} fallback="Saving a backup, then updating each item…" />}

      {step === 3 && result && (
        <div className="grid gap-4">
          <Outcomes outcomes={result.outcomes} changes={preview?.changes ?? null} />
          <div className="flex justify-end"><Button onClick={onDone}>Done</Button></div>
        </div>
      )}
    </Panel>
  )
}
