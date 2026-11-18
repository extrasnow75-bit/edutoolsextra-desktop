/**
 * Find and replace across courses: search builds a preview of every match, apply writes only the
 * ones the person kept ticked. Searching only reads Canvas.
 *
 * Where each kind of text lives, and how it is written back:
 *
 * | Kind          | Read from                          | Title key / body key                      |
 * | ------------- | ---------------------------------- | ----------------------------------------- |
 * | page          | pages/:page_id (body needs a GET)  | wiki_page[title] / wiki_page[body]        |
 * | assignment    | assignments                        | assignment[name] / assignment[description]|
 * | discussion    | discussion_topics                  | title / message                           |
 * | announcement  | discussion_topics (announcements)  | title / message                           |
 * | quiz          | quizzes (Classic)                  | quiz[title] / quiz[description]           |
 * | syllabus      | the course, with syllabus_body     | – / course[syllabus_body]                 |
 * | module item   | modules/:id/items                  | module_item[title] / –                    |
 *
 * A graded discussion or a Classic quiz is also an assignment in Canvas, with the same text
 * mirrored onto it. Those assignments are skipped so each change is made once, through the
 * discussion or quiz itself. New Quizzes have no Classic quiz, so they stay as assignments
 * (their description only; the questions are not reachable through this API).
 */
import type { CanvasLMS } from '../core/canvas'
import type { Payload } from '../core/types'
import type { FindRequest, FindScope, ObjectKind, Preview, ProposedChange } from '../../src/shared/api'
import { keepPreview } from './history'
import { type Op, type OpField, plainError } from './ops'
import { excerptAround, htmlToText, replaceInHtml, replaceInTitle, type ReplaceSpec } from './replace'

interface Source {
  kind: ObjectKind
  id: string
  title: string
  body: string | null
  visible: boolean
  getPath: string
  putPath: string
  titleKey: string | null
  bodyKey: string | null
  readTitle: string
  readBody: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

async function gather(client: CanvasLMS, courseId: string, scopes: Set<FindScope>, onItem: (label: string) => void): Promise<{ sources: Source[]; problems: string[] }> {
  const c = `/api/v1/courses/${courseId}`
  const sources: Source[] = []
  const problems: string[] = []
  const needBodies = (s: FindScope) => scopes.has(s)
  const anyOf = (...s: FindScope[]) => s.some((x) => scopes.has(x))

  const attempt = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (error) {
      problems.push(`${what}: ${plainError(error)}`)
    }
  }

  if (anyOf('pages', 'titles')) {
    await attempt('Pages', async () => {
      const pages = await client.listJson(`${c}/pages`)
      for (const p of pages) {
        const pageId = str(p.page_id)
        let body: string | null = null
        if (needBodies('pages')) {
          onItem(`Reading page “${str(p.title)}”`)
          body = str((await client.getJson(`${c}/pages/page_id:${pageId}`)).body)
        }
        sources.push({
          kind: 'page', id: pageId, title: str(p.title), body, visible: p.published === true,
          getPath: `${c}/pages/page_id:${pageId}`, putPath: `${c}/pages/page_id:${pageId}`,
          titleKey: 'wiki_page[title]', bodyKey: 'wiki_page[body]', readTitle: 'title', readBody: 'body',
        })
      }
    })
  }

  if (anyOf('assignments', 'titles')) {
    await attempt('Assignments', async () => {
      onItem('Reading assignments')
      const list = await client.listJson(`${c}/assignments`, { override_assignment_dates: 'false' })
      for (const a of list) {
        const types = Array.isArray(a.submission_types) ? (a.submission_types as string[]) : []
        if (types.includes('discussion_topic') || types.includes('online_quiz')) continue
        const id = str(a.id)
        sources.push({
          kind: 'assignment', id, title: str(a.name), body: needBodies('assignments') ? str(a.description) : null,
          visible: a.published === true,
          getPath: `${c}/assignments/${id}?override_assignment_dates=false`, putPath: `${c}/assignments/${id}`,
          titleKey: 'assignment[name]', bodyKey: 'assignment[description]', readTitle: 'name', readBody: 'description',
        })
      }
    })
  }

  const topics = async (announcements: boolean) => {
    const scope: FindScope = announcements ? 'announcements' : 'discussions'
    if (!anyOf(scope, 'titles')) return
    await attempt(announcements ? 'Announcements' : 'Discussions', async () => {
      onItem(announcements ? 'Reading announcements' : 'Reading discussions')
      const list = announcements ? await client.listAnnouncements(courseId) : await client.listDiscussions(courseId)
      for (const t of list) {
        const id = str(t.id)
        sources.push({
          kind: announcements ? 'announcement' : 'discussion', id, title: str(t.title),
          body: needBodies(scope) ? str(t.message) : null, visible: t.published === true,
          getPath: `${c}/discussion_topics/${id}`, putPath: `${c}/discussion_topics/${id}`,
          titleKey: 'title', bodyKey: 'message', readTitle: 'title', readBody: 'message',
        })
      }
    })
  }
  await topics(false)
  await topics(true)

  if (anyOf('quizzes', 'titles')) {
    await attempt('Quizzes', async () => {
      onItem('Reading quizzes')
      const list = await client.listQuizzes(courseId)
      for (const q of list) {
        const id = str(q.id)
        sources.push({
          kind: 'quiz', id, title: str(q.title), body: needBodies('quizzes') ? str(q.description) : null,
          visible: q.published === true,
          getPath: `${c}/quizzes/${id}`, putPath: `${c}/quizzes/${id}`,
          titleKey: 'quiz[title]', bodyKey: 'quiz[description]', readTitle: 'title', readBody: 'description',
        })
      }
    })
  }

  if (scopes.has('syllabus')) {
    await attempt('Syllabus', async () => {
      onItem('Reading the syllabus')
      const course = await client.getJson(c, { 'include[]': 'syllabus_body' })
      sources.push({
        kind: 'syllabus', id: courseId, title: 'Syllabus', body: str(course.syllabus_body), visible: true,
        getPath: `${c}?include[]=syllabus_body`, putPath: c,
        titleKey: null, bodyKey: 'course[syllabus_body]', readTitle: 'name', readBody: 'syllabus_body',
      })
    })
  }

  if (scopes.has('moduleItems')) {
    await attempt('Module items', async () => {
      onItem('Reading modules')
      const modules = await client.listModules(courseId)
      for (const m of modules) {
        const items = await client.listModuleItems(courseId, str(m.id))
        for (const it of items) {
          const id = str(it.id)
          const path = `${c}/modules/${str(m.id)}/items/${id}`
          sources.push({
            kind: 'moduleItem', id, title: str(it.title), body: null, visible: it.published === true,
            getPath: path, putPath: path, titleKey: 'module_item[title]', bodyKey: null, readTitle: 'title', readBody: '',
          })
        }
      }
    })
  }

  return { sources, problems }
}

const KIND_WORD: Record<ObjectKind, string> = {
  page: 'Page', assignment: 'Assignment', discussion: 'Discussion', announcement: 'Announcement',
  quiz: 'Quiz', syllabus: 'Syllabus', module: 'Module', moduleItem: 'Module item',
}

export function kindWord(kind: ObjectKind): string {
  return KIND_WORD[kind]
}

/** Builds the proposed changes for one source, or null when nothing in it matches. */
export function proposeFor(src: Source, spec: ReplaceSpec, scopes: Set<FindScope>, courseId: string, courseLabel: string): { change: ProposedChange; op: Op } | null {
  const fields: OpField[] = []
  const shown: ProposedChange['fields'] = []
  const titleAllowed = src.titleKey !== null && (scopes.has('titles') || src.kind === 'moduleItem')
  if (titleAllowed) {
    const t = replaceInTitle(src.title, spec)
    if (t.count > 0 && t.value !== src.title) {
      fields.push({ key: src.titleKey as string, read: src.readTitle, before: src.title, after: t.value, kind: 'text' })
      shown.push({ field: 'title', label: 'Title', beforeText: src.title, afterText: t.value })
    }
  }
  if (src.body !== null && src.bodyKey) {
    const b = replaceInHtml(src.body, spec)
    if (b.count > 0 && b.value !== src.body) {
      fields.push({ key: src.bodyKey, read: src.readBody, before: src.body, after: b.value, kind: 'html' })
      const needle = spec.find.trim()
      shown.push({
        field: 'body',
        label: b.count === 1 ? 'Body · 1 match' : `Body · ${b.count} matches`,
        beforeText: excerptAround(htmlToText(src.body), needle),
        afterText: excerptAround(htmlToText(b.value), spec.replace.trim() || needle),
      })
    }
  }
  if (fields.length === 0) return null
  const id = `${courseId}:${src.kind}:${src.id}`
  const warnings: string[] = []
  if (src.visible && src.kind !== 'syllabus') warnings.push('Students can see this.')
  if (src.kind === 'page' && fields.some((f) => f.read === 'title')) warnings.push("Renaming a page changes its web address. Canvas redirects the old address, but check links to it.")
  return {
    change: { id, courseId, courseLabel, kind: src.kind, objectTitle: src.title, visible: src.visible, fields: shown, warnings },
    op: { type: 'update', id, courseId, label: `${courseLabel}: ${src.title}`, getPath: src.getPath, putPath: src.putPath, fields },
  }
}

/** Plain words, digits and spaces: safe to look for in what Canvas stores. */
export function markerFor(replace: string): string | undefined {
  const r = replace.trim()
  return r && /^[\w\s.,:;!?'()-]+$/.test(r) ? r.split(/\s+/)[0] : undefined
}

export async function search(client: CanvasLMS, req: FindRequest, progress: (done: number, total: number, label: string) => void): Promise<Preview> {
  const spec: ReplaceSpec = { mode: req.mode, find: req.find, replace: req.replace, matchLongerLinks: req.matchLongerLinks, caseSensitive: req.caseSensitive }
  const scopes = new Set(req.scopes)
  const changes: ProposedChange[] = []
  const problems: Preview['problems'] = []
  const ops = new Map<string, Op[]>()
  for (let i = 0; i < req.courseIds.length; i++) {
    const courseId = req.courseIds[i]
    const label = req.courseLabels[courseId] ?? courseId
    progress(i, req.courseIds.length, `Searching ${label}`)
    const { sources, problems: found } = await gather(client, courseId, scopes, (l) => progress(i, req.courseIds.length, `${label}: ${l}`))
    for (const message of found) problems.push({ courseLabel: label, message })
    for (const src of sources) {
      const p = proposeFor(src, spec, scopes, courseId, label)
      if (!p) continue
      changes.push(p.change)
      ops.set(p.change.id, [p.op])
    }
  }
  progress(req.courseIds.length, req.courseIds.length, 'Done')
  const previewId = keepPreview(ops, req.courseIds.map((id) => req.courseLabels[id] ?? id), markerFor(req.replace))
  return { previewId, changes, problems }
}

export type { Source, Payload }
