/**
 * The courses a person can choose from. Adapted from Canvas Extractor Tools 1.2.0
 * (electron/ipc/courseList.ts), so the two apps offer the same list in the same order: masters
 * and templates first, then the newest term first, then by name. Only courses where the person
 * is a teacher, TA or designer are offered.
 *
 * Changes from the Extractor: requests go through Shane's CanvasLMS client (retries, rate
 * limits) instead of the Extractor's fetch helper, and the token never reaches the window.
 */
import type { CanvasLMS } from '../core/canvas'
import type { CourseChoice, CourseRole, SessionCourse } from '../../src/shared/api'

interface RawCourse {
  id: number
  name?: string
  course_code?: string
  workflow_state?: string
  blueprint?: boolean
  end_at?: string | null
  term?: { name?: string; start_at?: string | null; end_at?: string | null } | null
  enrollments?: Array<{ type?: string; role?: string }>
}

/** The group for masters and templates, which belong to no real term. Same word as the Extractor. */
export const NO_TERM = 'No term'

const isRealTerm = (name: string | undefined): boolean => Boolean(name?.trim()) && !/^default term$/i.test(name as string)

/** Canvas writes the same role as "teacher" in some places and "TeacherEnrollment" in others. */
export function roleOf(type: string | undefined): CourseRole | null {
  const t = (type ?? '').toLowerCase().replace(/enrollment$/, '')
  if (t === 'teacher') return 'teacher'
  if (t === 'ta') return 'ta'
  if (t === 'designer') return 'designer'
  return null
}

const BUILT_IN_LABEL: Record<CourseRole, string> = { teacher: 'Teacher', ta: 'TA', designer: 'Designer' }

/** The badge words; a custom role such as "Course Administrator" shows its own name. */
export function roleLabelOf(enrollments: Array<{ type?: string; role?: string }>): string {
  const labels: string[] = []
  for (const e of enrollments) {
    const base = roleOf(e.type)
    if (base === null) continue
    const custom = (e.role ?? '').trim()
    const label = custom && roleOf(custom) === null ? custom : BUILT_IN_LABEL[base]
    if (!labels.includes(label)) labels.push(label)
  }
  return labels.join(', ')
}

const PRIORITY: CourseRole[] = ['teacher', 'designer', 'ta']

export function chooseCourses(raw: RawCourse[], now = new Date()): CourseChoice[] {
  const seen = new Set<number>()
  const out: CourseChoice[] = []
  for (const c of raw) {
    if (seen.has(c.id)) continue
    const roles = (c.enrollments ?? []).map((e) => roleOf(e.type)).filter((r): r is CourseRole => r !== null)
    if (roles.length === 0) continue
    seen.add(c.id)
    const real = isRealTerm(c.term?.name)
    const endAt = real ? (c.term?.end_at ?? c.end_at ?? null) : null
    out.push({
      id: String(c.id),
      name: c.name?.trim() || `Course ${c.id}`,
      code: c.course_code?.trim() ?? '',
      role: PRIORITY.find((p) => roles.includes(p)) as CourseRole,
      roleLabel: roleLabelOf(c.enrollments ?? []),
      term: real ? (c.term?.name as string).trim() : NO_TERM,
      termStart: real ? (c.term?.start_at ?? null) : null,
      ended: real && (c.workflow_state === 'completed' || (endAt !== null && Date.parse(endAt) < now.getTime())),
      blueprint: c.blueprint === true,
    })
  }
  return out.sort((a, b) => {
    if ((a.term === NO_TERM) !== (b.term === NO_TERM)) return a.term === NO_TERM ? -1 : 1
    const sa = a.termStart ? Date.parse(a.termStart) : -Infinity
    const sb = b.termStart ? Date.parse(b.termStart) : -Infinity
    return sb - sa || a.term.localeCompare(b.term) || a.name.localeCompare(b.name)
  })
}

const QUERY = 'include[]=term&state[]=available&state[]=unpublished'

export async function listMyCourses(client: CanvasLMS): Promise<CourseChoice[]> {
  const current = (await client.listJson(`/api/v1/courses?${QUERY}`)) as unknown as RawCourse[]
  let past: RawCourse[] = []
  try {
    past = (await client.listJson(`/api/v1/courses?${QUERY}&state[]=completed&enrollment_state=completed`)) as unknown as RawCourse[]
  } catch {
    // The current list is still useful if the past one fails.
  }
  return chooseCourses([...current, ...past])
}

/** One course by id, for a pasted address. */
export async function getSessionCourse(client: CanvasLMS, courseId: string): Promise<SessionCourse> {
  const c = (await client.getJson(`/api/v1/courses/${courseId}`, { 'include[]': 'term' })) as unknown as RawCourse
  return {
    id: String(c.id),
    name: c.name?.trim() || `Course ${c.id}`,
    code: c.course_code?.trim() ?? '',
    term: isRealTerm(c.term?.name) ? (c.term?.name as string).trim() : NO_TERM,
  }
}
