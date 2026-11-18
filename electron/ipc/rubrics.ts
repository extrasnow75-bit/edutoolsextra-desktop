/**
 * Match rubrics to assignments: every assignment (graded discussions and quizzes included, since
 * Canvas keeps those as assignments too) with the rubric linked to it, and the rubrics the course
 * has to choose from.
 *
 * Linking a rubric creates a rubric association for grading. Canvas allows one grading rubric per
 * assignment and replaces the old link when a new one is made. Removing deletes the association;
 * the rubric itself stays in the course. Ungraded discussions cannot carry a grading rubric, so
 * they are not listed.
 */
import type { CanvasLMS } from '../core/canvas'
import type { Payload } from '../core/types'
import type { RubricChange, RubricList, RubricRow } from '../../src/shared/api'
import { type Op, readKey } from './ops'

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

function typeOf(a: Payload): string {
  const types = Array.isArray(a.submission_types) ? (a.submission_types as string[]) : []
  if (types.includes('discussion_topic')) return 'discussion'
  if (types.includes('online_quiz')) return 'quiz'
  if (a.is_quiz_lti_assignment === true || (types.includes('external_tool') && /quiz/i.test(str((a.external_tool_tag_attributes as Payload | undefined)?.url)))) return 'new quiz'
  return 'assignment'
}

export async function listRubrics(client: CanvasLMS, courseId: string): Promise<RubricList> {
  const c = `/api/v1/courses/${courseId}`
  const [assignments, rubrics] = await Promise.all([
    client.listJson(`${c}/assignments`, { override_assignment_dates: 'false' }),
    client.listRubrics(courseId),
  ])
  const rows: RubricRow[] = assignments.map((a) => ({
    assignmentId: str(a.id),
    title: str(a.name),
    type: typeOf(a),
    rubricId: readKey(a, 'rubric_settings.id'),
    rubricTitle: readKey(a, 'rubric_settings.title'),
    graded: a.grading_type !== 'not_graded',
    hasSubmissions: a.has_submitted_submissions === true,
    published: a.published === true,
  }))
  return {
    rows,
    rubrics: rubrics
      .map((r) => ({ id: str(r.id), title: str(r.title), points: Number(r.points_possible ?? 0) }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  }
}

function linkData(rubricId: string, assignmentId: string): Array<[string, string]> {
  return [
    ['rubric_association[rubric_id]', rubricId],
    ['rubric_association[association_id]', assignmentId],
    ['rubric_association[association_type]', 'Assignment'],
    ['rubric_association[use_for_grading]', 'true'],
    ['rubric_association[purpose]', 'grading'],
  ]
}

/** The association id that ties `rubricId` to `assignmentId`, needed to remove it. */
async function associationId(client: CanvasLMS, courseId: string, rubricId: string, assignmentId: string): Promise<string | null> {
  const rubric = await client.getJson(`/api/v1/courses/${courseId}/rubrics/${rubricId}`, { 'include[]': 'assignment_associations' })
  const list = Array.isArray(rubric.associations) ? (rubric.associations as Payload[]) : []
  const match = list.find((a) => str(a.association_id) === assignmentId && str(a.association_type) === 'Assignment')
  return match ? str(match.id) : null
}

/** The ops for the changes, given each row as it was listed. */
export async function rubricOps(client: CanvasLMS, courseId: string, courseLabel: string, rows: RubricRow[], changes: RubricChange[]): Promise<Op[]> {
  const c = `/api/v1/courses/${courseId}`
  const ops: Op[] = []
  for (const ch of changes) {
    const row = rows.find((r) => r.assignmentId === ch.assignmentId)
    if (!row || row.rubricId === ch.rubricId) continue
    const id = `${courseId}:rubric:${row.assignmentId}`
    const label = `${courseLabel}: ${row.title}`
    const verifyPath = `${c}/assignments/${row.assignmentId}?override_assignment_dates=false`
    if (ch.rubricId) {
      ops.push({
        type: 'create', id, courseId, label,
        postPath: `${c}/rubric_associations`,
        data: linkData(ch.rubricId, row.assignmentId),
        idKey: 'rubric_association.id',
        undoPath: `${c}/rubric_associations/{id}`,
        verify: { getPath: verifyPath, read: 'rubric_settings.id', equals: ch.rubricId },
        // Undo puts the old rubric back; with no old rubric, it deletes the new link (the default).
        undoOp: row.rubricId
          ? { type: 'create', id, courseId, label, postPath: `${c}/rubric_associations`, data: linkData(row.rubricId, row.assignmentId), idKey: 'rubric_association.id', undoPath: `${c}/rubric_associations/{id}` }
          : undefined,
      })
    } else if (row.rubricId) {
      const assoc = await associationId(client, courseId, row.rubricId, row.assignmentId)
      if (!assoc) continue
      ops.push({
        type: 'delete', id, courseId, label,
        deletePath: `${c}/rubric_associations/${assoc}`,
        recreate: { postPath: `${c}/rubric_associations`, data: linkData(row.rubricId, row.assignmentId), undoPath: `${c}/rubric_associations/{id}`, idKey: 'rubric_association.id' },
      })
    }
  }
  return ops
}
