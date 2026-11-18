/**
 * The start screen ("What are you working on today?") and the task screen for updating existing
 * courses, laid out as in the agreed mockup: cards in the Rubric Creator style, one button each,
 * with the course-folder tools folded away.
 */
import React from 'react'
import { ArrowRight, Calendar, Check, Eye, FileText, Grid3x3, Pencil, Repeat2, Sparkles } from 'lucide-react'
import type { SessionCourse } from '../shared/api'
import { courseLabel } from '../components/CoursePicker'
import { Button, Chip } from '../components/ui'

export type Route =
  | 'start' | 'home' | 'term' | 'find' | 'rubrics' | 'history'
  | 'soon:build' | 'soon:docs' | 'soon:quick' | 'soon:grade' | 'soon:look' | 'soon:folder'

function CanvasMark() {
  return (
    <svg viewBox="0 0 100 100" className="w-5 h-5" fill="currentColor" aria-hidden="true">
      <circle cx="50" cy="50" r="12" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <circle key={a} cx="50" cy="16" r="8" transform={`rotate(${a},50,50)`} />)}
    </svg>
  )
}

function Tile({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className={`w-10 h-10 rounded-xl grid place-items-center text-white ${color}`}>{children}</span>
}

function Card({ from, to, title, text, action, onClick, badge, primary }: { from: React.ReactNode; to: React.ReactNode; title: string; text: string; action: string; onClick(): void; badge?: React.ReactNode; primary?: boolean }) {
  return (
    <article className="relative bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-1.5">
      {badge && <span className="absolute top-3.5 right-3.5">{badge}</span>}
      <div className="flex items-center gap-2 mb-1.5">{from}<ArrowRight className="w-4 h-4 text-gray-400" aria-hidden="true" />{to}</div>
      <h3 className="font-bold text-[15px]">{title}</h3>
      <p className="text-[13px] text-gray-700 flex-1">{text}</p>
      <Button variant={primary ? 'primary' : 'ghost'} className="mt-2 w-full" onClick={onClick}>{action}</Button>
    </article>
  )
}

export function Start({ last, go, onContinue }: { last: SessionCourse[]; go(r: Route): void; onContinue(): void }) {
  const paths = [
    { route: 'soon:build' as Route, icons: [<Tile key="a" color="bg-green-700"><FileText className="w-5 h-5" /></Tile>, <Tile key="b" color="bg-brand"><Sparkles className="w-5 h-5" /></Tile>], title: 'Build a new course', text: 'Build from a course blueprint doc, or let AI draft from a design map and your links, readings and videos. Refine it by typing requests, then publish.', foot: 'Coming soon' },
    { route: 'term' as Route, icons: [<Tile key="a" color="bg-cyan-700"><Calendar className="w-5 h-5" /></Tile>, <Tile key="b" color="bg-[#e13c26]"><CanvasMark /></Tile>], title: 'Get courses ready for a new term', text: 'Move due dates, set module unlock dates, add dates to module titles and mark holidays, in one course or many.', foot: 'Works on one course or many' },
    { route: 'home' as Route, icons: [<Tile key="a" color="bg-[#e13c26]"><CanvasMark /></Tile>, <Tile key="b" color="bg-violet-600"><Repeat2 className="w-5 h-5" /></Tile>], title: 'Update existing courses', text: 'Find and replace, match rubrics to assignments, and more. Pick one course or several.', foot: 'Works on one course or many' },
  ]
  return (
    <div className="grid gap-4">
      {last.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <div className="flex-1 min-w-0">
            <b className="text-[14px]">Continue where you left off</b>
            <div className="text-xs text-gray-600 truncate">{last.length === 1 ? '1 course' : `${last.length} courses`}: {last.map(courseLabel).join(', ')}</div>
          </div>
          <Button onClick={onContinue}>Continue</Button>
        </div>
      )}
      <h2 className="text-xl font-bold text-center mt-2">What are you working on today?</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {paths.map((p) => (
          <button key={p.title} type="button" onClick={() => go(p.route)} className="text-left bg-white border border-gray-200 hover:border-brand rounded-2xl p-4 flex flex-col gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <span className="flex items-center gap-1.5">{p.icons[0]}<ArrowRight className="w-4 h-4 text-gray-400" aria-hidden="true" />{p.icons[1]}</span>
            <b className="text-[16px]">{p.title}</b>
            <span className="text-[13px] text-gray-700 flex-1">{p.text}</span>
            <span className="text-xs font-bold text-brand">{p.foot}</span>
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-gray-600">You can come back here any time with the Start link. · <Button variant="link" onClick={() => go('history')}>See recent changes</Button></p>
    </div>
  )
}

export function Tasks({ go }: { go(r: Route): void }) {
  const red = <Tile color="bg-[#e13c26]"><CanvasMark /></Tile>
  return (
    <div className="grid gap-4">
      <article className="bg-white border-2 border-brand rounded-2xl p-5 grid sm:grid-cols-[1.3fr_1fr] gap-4">
        <div className="grid gap-2 content-start">
          <span className="text-[11.5px] font-extrabold tracking-wider uppercase text-brand">Before the term starts</span>
          <h3 className="text-xl font-bold">Get ready for teaching</h3>
          <p className="text-[13.5px] text-gray-700">Enter the term dates, then move due dates, set module unlock dates, date module titles and mark holidays in every selected course at once. You see every change before anything is saved.</p>
          <div><Button onClick={() => go('term')}>Set up the term</Button></div>
        </div>
        <ul className="bg-gray-50 rounded-xl p-3 grid gap-1.5 text-[13px] content-start">
          <li className="flex gap-2"><Check className="w-4 h-4 text-green-700" aria-hidden="true" />Due dates for the new term</li>
          <li className="flex gap-2"><Check className="w-4 h-4 text-green-700" aria-hidden="true" />Module unlock dates and title dates</li>
          <li className="flex gap-2"><Check className="w-4 h-4 text-green-700" aria-hidden="true" />Holiday markers</li>
          <li className="flex gap-2 text-gray-500"><span className="w-4" />Gradebook, Course Questions, broken links: coming next</li>
        </ul>
      </article>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[12px] tracking-wider uppercase font-bold text-gray-600">During the term</h3>
        <Button variant="link" onClick={() => go('history')}>Recent changes</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card from={red} to={<Tile color="bg-violet-600"><Repeat2 className="w-5 h-5" /></Tile>} title="Find and replace" text="Rename or renumber an assignment everywhere it's mentioned, or swap an old link or video for a new one, without opening each page." action="Find and replace" onClick={() => go('find')} primary />
        <Card from={<Tile color="bg-brand"><Grid3x3 className="w-5 h-5" /></Tile>} to={red} title="Match rubrics to assignments" text="See every assignment and graded discussion with its rubric in one list. Link missing rubrics or swap one for another." action="Open rubric list" onClick={() => go('rubrics')} />
        <Card from={<Tile color="bg-green-700"><FileText className="w-5 h-5" /></Tile>} to={red} title="Update a document everywhere" text="Edit a Google Doc once and replace the old copy in each course's Files, so existing links keep working." action="Coming soon" onClick={() => go('soon:docs')} badge={<Chip>Coming soon</Chip>} />
        <Card from={red} to={<Tile color="bg-brand"><Pencil className="w-5 h-5" /></Tile>} title="Quick fix" text="Edit, publish or hide one page, assignment, discussion or quiz directly in Canvas." action="Coming soon" onClick={() => go('soon:quick')} badge={<Chip>Coming soon</Chip>} />
        <Card from={red} to={<Tile color="bg-amber-700"><Check className="w-5 h-5" /></Tile>} title="Grade work" text="Ungraded submissions, scores with feedback, and grading a batch from a spreadsheet." action="Coming soon" onClick={() => go('soon:grade')} badge={<Chip>Coming soon</Chip>} />
        <Card from={red} to={<Tile color="bg-brand"><Eye className="w-5 h-5" /></Tile>} title="Look at the course" text="Assignments, modules, pages, grade groups and students as Canvas has them now. Read only." action="Coming soon" onClick={() => go('soon:look')} badge={<Chip>Coming soon</Chip>} />
      </div>

      <button type="button" onClick={() => go('soon:folder')} className="text-left bg-white border border-gray-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <span><b className="text-[14px]">Course folder tools</b><span className="block text-xs text-gray-600">Publish, plan the term, back up, start-of-term reset. For courses built from text files with Shane's edutools.</span></span>
        <Chip>Coming soon</Chip>
      </button>
      <p className="text-xs text-gray-600">Also in the eCampus toolkit: Canvas Extractor Tools (course to Google Docs) · Canvas Rubric Creator (write and upload rubrics)</p>
    </div>
  )
}

const SOON: Record<string, { title: string; text: string }> = {
  build: { title: 'Build a new course', text: 'Two ways in: build from a course blueprint doc (the Google Doc format Extractor Tools makes), or let AI draft from a design map plus a list of links, readings and videos. You refine it by typing requests, review what the AI added, and publish. Needs an AI key and Shane\'s publishing engine, which come in a later version.' },
  docs: { title: 'Update a document everywhere', text: 'Pick a Google Doc, save it as a Word file, and replace the same-named file in each selected course\'s Files so existing links keep working. Needs Google sign-in, which comes in a later version.' },
  quick: { title: 'Quick fix', text: 'Edit, publish or hide one page, assignment, discussion or quiz directly in Canvas, with a guard before changing anything students can see.' },
  grade: { title: 'Grade work', text: 'Ungraded submissions, scores with written feedback, editing feedback already left, and grading a batch from a spreadsheet. Shane\'s terminal tool already does this.' },
  look: { title: 'Look at the course', text: 'Assignments, modules, pages, grade groups and students as Canvas has them now, with Open in Canvas.' },
  folder: { title: 'Course folder tools', text: 'Shane\'s publishing workflow: publish changes from a course folder with a 4-step Review → Preview → Publish → Check flow, plan the term from canvas.toml, back up a course, and the start-of-term reset. These reuse Shane\'s engine, copied in with these screens.' },
}

export function ComingSoon({ which, go }: { which: string; go(r: Route): void }) {
  const s = SOON[which] ?? { title: 'Coming soon', text: '' }
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-6 grid gap-3 max-w-2xl">
      <Chip tone="info" className="w-fit">Coming in a later version</Chip>
      <h2 className="text-lg font-bold">{s.title}</h2>
      <p className="text-[13.5px] text-gray-700">{s.text}</p>
      <div><Button variant="ghost" onClick={() => go(which === 'build' ? 'start' : 'home')}>← Back</Button></div>
    </section>
  )
}
