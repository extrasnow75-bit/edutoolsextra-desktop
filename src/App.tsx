/**
 * The window: the blue title bar and white ribbon of Extractor Tools, Initial setup, the course
 * banner, and whichever screen is open.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { History as HistoryIcon } from 'lucide-react'
import type { SavedGroup, SessionCourse, SetupStatus } from './shared/api'
import { CourseBanner } from './components/CourseBanner'
import { CoursePicker } from './components/CoursePicker'
import { SetupPanel } from './components/SetupPanel'
import { Button } from './components/ui'
import { FindReplace } from './screens/FindReplace'
import { History } from './screens/History'
import { ComingSoon, type Route, Start, Tasks } from './screens/Home'
import { Rubrics } from './screens/Rubrics'
import { TermSetup } from './screens/TermSetup'

const isMac = window.api?.app?.platform === 'darwin'

/** Screens that change courses need a course banner and a chosen course. */
const NEEDS_COURSES: Route[] = ['home', 'term', 'find', 'rubrics']

export default function App() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [route, setRoute] = useState<Route>('start')
  const [courses, setCourses] = useState<SessionCourse[]>([])
  const [lastCourses, setLastCourses] = useState<SessionCourse[]>([])
  const [groups, setGroups] = useState<SavedGroup[]>([])
  const [picking, setPicking] = useState(false)
  const [zoom, setZoom] = useState(0)

  const refreshStatus = useCallback(() => window.api.setup.status().then(setStatus), [])

  useEffect(() => {
    void refreshStatus()
    window.api.session.load().then((s) => {
      setLastCourses(s.courses)
      setGroups(s.groups)
    })
    window.api.app.getZoom().then(setZoom)
  }, [refreshStatus])

  const go = (r: Route) => {
    setRoute(r)
    // A tool that changes courses asks which ones first, unless the session already has some.
    if (NEEDS_COURSES.includes(r) && courses.length === 0 && status?.hasToken) setPicking(true)
    window.scrollTo({ top: 0 })
  }

  const chooseCourses = (chosen: SessionCourse[]) => {
    setCourses(chosen)
    setLastCourses(chosen)
    void window.api.session.save(chosen)
    setPicking(false)
  }

  const step = async (d: number) => setZoom(await window.api.app.stepZoom(d))

  if (!status) {
    return <div className="flex items-center justify-center h-screen bg-slate-50"><p className="text-gray-600 text-sm" role="status">Loading…</p></div>
  }

  const showBanner = NEEDS_COURSES.includes(route)

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-gray-900">
      <header
        className={`flex items-center justify-between pr-4 bg-brand text-white flex-shrink-0 ${isMac ? 'pl-20' : 'pl-4'}`}
        style={{ height: 36, WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <h1 className="text-sm font-black tracking-wide">edutools</h1>
      </header>
      <nav aria-label="App controls" className="flex items-center justify-between gap-3 px-4 h-11 bg-white border-b border-gray-200 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span className="flex items-center gap-3 min-w-0">
          {route !== 'start' && <Button variant="link" onClick={() => setRoute('start')}>← Start</Button>}
          {route !== 'start' && route !== 'home' && NEEDS_COURSES.includes(route) && <Button variant="link" onClick={() => setRoute('home')}>All tasks</Button>}
          <span className="text-xs text-gray-600 truncate">Get Canvas courses ready for the term and keep them current</span>
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          <button type="button" aria-label="Zoom out" onClick={() => step(-1)} className="w-7 h-7 rounded-lg border border-gray-500 text-gray-700 font-bold">−</button>
          <span className="text-xs text-gray-600 w-10 text-center tabular-nums">{Math.round(Math.pow(1.2, zoom) * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => step(1)} className="w-7 h-7 rounded-lg border border-gray-500 text-gray-700 font-bold">+</button>
          <button type="button" onClick={() => setRoute('history')} className="flex items-center gap-1.5 text-xs font-bold text-gray-700 border border-gray-500 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            <HistoryIcon className="w-3.5 h-3.5" aria-hidden="true" /> Recent changes
          </button>
        </span>
      </nav>

      <main className="flex-1 overflow-auto">
        <div className={`mx-auto px-6 py-5 grid gap-4 ${route === 'start' ? 'max-w-4xl' : 'max-w-5xl'}`}>
          {route !== 'start' && route !== 'history' && <SetupPanel status={status} onChange={refreshStatus} />}
          {route === 'start' && !status.hasToken && <SetupPanel status={status} onChange={refreshStatus} />}
          {showBanner && <CourseBanner courses={courses} onChange={() => setPicking(true)} />}

          {route === 'start' && <Start last={lastCourses} go={go} onContinue={() => { setCourses(lastCourses); setRoute('home') }} />}
          {route === 'home' && <Tasks go={go} />}
          {route === 'term' && courses.length > 0 && <TermSetup courses={courses} onChangeCourses={() => setPicking(true)} onDone={() => setRoute('home')} />}
          {route === 'find' && courses.length > 0 && <FindReplace courses={courses} onChangeCourses={() => setPicking(true)} onDone={() => setRoute('home')} />}
          {route === 'rubrics' && courses.length > 0 && <Rubrics courses={courses} />}
          {route === 'history' && <History />}
          {route.startsWith('soon:') && <ComingSoon which={route.slice(5)} go={go} />}
        </div>
      </main>

      {picking && (
        <CoursePicker
          initial={courses.length ? courses : lastCourses}
          groups={groups}
          onGroupsChange={setGroups}
          onDone={chooseCourses}
          onCancel={() => setPicking(false)}
        />
      )}
    </div>
  )
}
