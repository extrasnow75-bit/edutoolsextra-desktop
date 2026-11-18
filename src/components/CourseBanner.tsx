/**
 * Which course or courses the tools will change, at the top of every task screen, so it is never
 * a guess. Replaces the small status-bar text in Shane's app.
 */
import React from 'react'
import type { SessionCourse } from '../shared/api'
import { courseLabel } from './CoursePicker'
import { Button } from './ui'

/** "CS 221-001" → CS over 221, the way the mockup's course tiles read. */
function tile(c: SessionCourse): React.ReactNode {
  const m = /^([A-Za-z]{2,5})\s*-?\s*(\d{2,4})/.exec(c.code || c.name)
  if (m) return <>{m[1].toUpperCase()}<br />{m[2]}</>
  return (c.code || c.name).slice(0, 4).toUpperCase()
}

export function CourseBanner({ courses, onChange }: { courses: SessionCourse[]; onChange(): void }) {
  if (courses.length === 0) {
    return (
      <div className="bg-white border-2 border-dashed border-brand rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[14px]"><b>No course chosen yet.</b> Choose the course or courses to work on.</span>
        <Button onClick={onChange}>Choose courses</Button>
      </div>
    )
  }
  const one = courses.length === 1
  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
      <div className="flex">
        {courses.slice(0, 3).map((c, i) => (
          <span key={c.id} className={`w-12 h-12 rounded-xl bg-brand text-white grid place-items-center text-center leading-tight text-[11px] font-extrabold border-[3px] border-white ${i ? '-ml-2' : ''}`}>{tile(c)}</span>
        ))}
        {courses.length > 3 && <span className="w-12 h-12 -ml-2 rounded-xl bg-gray-100 text-gray-700 grid place-items-center text-[12px] font-extrabold border-[3px] border-white">+{courses.length - 3}</span>}
      </div>
      <div className="min-w-0">
        <h2 className="font-bold text-[16px] truncate">{one ? `${courses[0].name}${courses[0].term !== 'No term' ? ` · ${courses[0].term}` : ''}` : `${courses.length} courses selected`}</h2>
        <p className="text-[12.5px] text-gray-600 truncate">{one ? courses[0].code : courses.map(courseLabel).join(' · ')}</p>
      </div>
      <Button variant="ghost" onClick={onChange}>Change courses</Button>
    </div>
  )
}
