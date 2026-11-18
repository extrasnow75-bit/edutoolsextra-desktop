/**
 * A pretend Canvas, held in memory, for tests. It answers the few endpoints the tools use, the
 * way Canvas does (form-encoded writes, JSON answers), so a whole search → apply → undo round
 * trip runs without a network or a token.
 */
import { CanvasLMS } from '../electron/core/canvas'

type Obj = Record<string, unknown>

export interface FakeCourse {
  pages: Obj[]
  assignments: Obj[]
  topics: Obj[]
  quizzes: Obj[]
  modules: Array<Obj & { items: Obj[] }>
  syllabus: string
  rubrics: Obj[]
  associations: Obj[]
}

export function emptyCourse(): FakeCourse {
  return { pages: [], assignments: [], topics: [], quizzes: [], modules: [], syllabus: '', rubrics: [], associations: [] }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Form pairs → { "wiki_page[body]": "..." } */
function form(body: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof body === 'string') for (const [k, v] of new URLSearchParams(body)) out[k] = v
  return out
}

/** Copy "prefix[key]" form fields onto an object. */
function apply(obj: Obj, data: Record<string, string>, prefix: string | null): void {
  for (const [k, v] of Object.entries(data)) {
    const key = prefix ? (k.startsWith(`${prefix}[`) ? k.slice(prefix.length + 1, -1) : null) : k
    if (key) obj[key] = v === '' ? null : v
  }
}

export function fakeCanvas(courses: Record<string, FakeCourse>) {
  const log: string[] = []
  let nextId = 900
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const data = form(init?.body)
    const p = decodeURIComponent(url.pathname)
    log.push(`${method} ${p}`)
    const m = /^\/api\/v1\/courses\/(\d+)(.*)$/.exec(p)
    if (p === '/api/v1/users/self') return json({ id: 1 })
    if (!m) return json({ errors: 'not found' }, 404)
    const course = courses[m[1]]
    if (!course) return json({ errors: 'not found' }, 404)
    const rest = m[2]
    let r: RegExpExecArray | null

    if (rest === '' && method === 'GET') return json({ id: Number(m[1]), name: 'Course', syllabus_body: course.syllabus })
    if (rest === '' && method === 'PUT') {
      if ('course[syllabus_body]' in data) course.syllabus = data['course[syllabus_body]']
      return json({ id: Number(m[1]) })
    }
    if (rest === '/pages' && method === 'GET') return json(course.pages.map(({ body: _b, ...p }) => p))
    if ((r = /^\/pages\/page_id:(\d+)$/.exec(rest))) {
      const page = course.pages.find((x) => String(x.page_id) === r![1])
      if (!page) return json({}, 404)
      if (method === 'PUT') apply(page, data, 'wiki_page')
      return json(page)
    }
    if (rest === '/assignments' && method === 'GET') return json(course.assignments)
    if ((r = /^\/assignments\/(\d+)$/.exec(rest))) {
      const a = course.assignments.find((x) => String(x.id) === r![1])
      if (!a) return json({}, 404)
      if (method === 'PUT') apply(a, data, 'assignment')
      return json(a)
    }
    if (rest === '/discussion_topics' && method === 'GET') {
      const ann = url.searchParams.get('only_announcements') === 'true'
      return json(course.topics.filter((t) => Boolean(t.is_announcement) === ann))
    }
    if ((r = /^\/discussion_topics\/(\d+)$/.exec(rest))) {
      const t = course.topics.find((x) => String(x.id) === r![1])
      if (!t) return json({}, 404)
      if (method === 'PUT') apply(t, data, null)
      return json(t)
    }
    if (rest === '/quizzes' && method === 'GET') return json(course.quizzes)
    if ((r = /^\/quizzes\/(\d+)$/.exec(rest))) {
      const q = course.quizzes.find((x) => String(x.id) === r![1])
      if (!q) return json({}, 404)
      if (method === 'PUT') apply(q, data, 'quiz')
      return json(q)
    }
    if (rest === '/modules' && method === 'GET') return json(course.modules.map(({ items: _i, ...mod }) => mod))
    if ((r = /^\/modules\/(\d+)$/.exec(rest))) {
      const mod = course.modules.find((x) => String(x.id) === r![1])
      if (!mod) return json({}, 404)
      if (method === 'PUT') apply(mod, data, 'module')
      const { items: _i, ...out } = mod
      return json(out)
    }
    if ((r = /^\/modules\/(\d+)\/items$/.exec(rest))) {
      const mod = course.modules.find((x) => String(x.id) === r![1])
      if (!mod) return json({}, 404)
      if (method === 'POST') {
        const item: Obj = { id: nextId++, type: data['module_item[type]'], title: data['module_item[title]'], published: false }
        const pos = Number(data['module_item[position]'] ?? mod.items.length + 1)
        mod.items.splice(pos - 1, 0, item)
        return json(item)
      }
      return json(mod.items)
    }
    if ((r = /^\/modules\/(\d+)\/items\/(\d+)$/.exec(rest))) {
      const mod = course.modules.find((x) => String(x.id) === r![1])
      const idx = mod ? mod.items.findIndex((x) => String(x.id) === r![2]) : -1
      if (!mod || idx < 0) return json({}, 404)
      if (method === 'DELETE') return json(mod.items.splice(idx, 1)[0])
      if (method === 'PUT') apply(mod.items[idx], data, 'module_item')
      return json(mod.items[idx])
    }
    if (rest === '/rubrics' && method === 'GET') return json(course.rubrics)
    if ((r = /^\/rubrics\/(\d+)$/.exec(rest))) {
      const rubric = course.rubrics.find((x) => String(x.id) === r![1])
      if (!rubric) return json({}, 404)
      return json({ ...rubric, associations: course.associations.filter((a) => String(a.rubric_id) === r![1]) })
    }
    if (rest === '/rubric_associations' && method === 'POST') {
      const assignmentId = data['rubric_association[association_id]']
      const rubricId = data['rubric_association[rubric_id]']
      // Canvas keeps one grading rubric per assignment: a new link replaces the old one.
      course.associations = course.associations.filter((a) => String(a.association_id) !== assignmentId)
      const assoc = { id: nextId++, rubric_id: rubricId, association_id: assignmentId, association_type: 'Assignment' }
      course.associations.push(assoc)
      const a = course.assignments.find((x) => String(x.id) === assignmentId)
      const rubric = course.rubrics.find((x) => String(x.id) === rubricId)
      if (a && rubric) a.rubric_settings = { id: rubric.id, title: rubric.title }
      return json({ rubric_association: assoc })
    }
    if ((r = /^\/rubric_associations\/(\d+)$/.exec(rest)) && method === 'DELETE') {
      const idx = course.associations.findIndex((x) => String(x.id) === r![1])
      if (idx < 0) return json({}, 404)
      const [gone] = course.associations.splice(idx, 1)
      const a = course.assignments.find((x) => String(x.id) === String(gone.association_id))
      if (a) delete a.rubric_settings
      return json({ rubric_association: gone })
    }
    return json({ errors: `fake Canvas has no ${method} ${rest}` }, 404)
  }
  const client = new CanvasLMS({ token: 'test-token', endpoint: 'https://test.instructure.com', fetch: fetchImpl as typeof fetch, sleep: async () => {} })
  return { client, log }
}
