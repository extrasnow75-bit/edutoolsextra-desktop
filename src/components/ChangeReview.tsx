/**
 * The review step shared by every tool: each proposed change, grouped by course, with a box to
 * keep or drop it and a side-by-side comparison of what Canvas has now and what it will have.
 * Nothing in here writes anything; it only decides which change ids go back to the main process.
 */
import React, { useMemo, useState } from 'react'
import type { ApplyOutcome, Preview, ProposedChange } from '../shared/api'
import { Callout, Chip, Compare } from './ui'

const KIND: Record<ProposedChange['kind'], string> = {
  page: 'Page', assignment: 'Assignment', discussion: 'Discussion', announcement: 'Announcement',
  quiz: 'Quiz', syllabus: 'Syllabus', module: 'Module', moduleItem: 'Module item',
}

export function ChangeReview({ preview, selected, onSelected, compareLabels }: {
  preview: Preview
  selected: Set<string>
  onSelected(next: Set<string>): void
  compareLabels?: { left: string; right: string }
}) {
  const [openId, setOpenId] = useState<string | null>(preview.changes[0]?.id ?? null)
  const byCourse = useMemo(() => {
    const m = new Map<string, ProposedChange[]>()
    for (const c of preview.changes) m.set(c.courseLabel, [...(m.get(c.courseLabel) ?? []), c])
    return [...m.entries()]
  }, [preview])

  const set = (ids: string[], on: boolean) => {
    const next = new Set(selected)
    for (const id of ids) (on ? next.add(id) : next.delete(id))
    onSelected(next)
  }

  return (
    <div className="grid gap-3">
      {preview.problems.map((p, i) => (
        <Callout key={i} tone="warn"><b>{p.courseLabel}:</b> {p.message}</Callout>
      ))}
      {byCourse.map(([course, changes]) => {
        const ids = changes.map((c) => c.id)
        const n = ids.filter((id) => selected.has(id)).length
        return (
          <div key={course} className="border border-gray-200 rounded-xl overflow-hidden" role="group" aria-label={course}>
            <label className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 font-bold text-[13.5px] cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-brand" checked={n === ids.length} ref={(el) => { if (el) el.indeterminate = n > 0 && n < ids.length }} onChange={(e) => set(ids, e.target.checked)} />
              {course}
              <span className="font-normal text-xs text-gray-600">{n} of {ids.length} selected</span>
            </label>
            <ul>
              {changes.map((c) => (
                <li key={c.id} className="border-t border-gray-200">
                  <div className="flex items-start gap-2.5 px-3 py-2">
                    <input
                      type="checkbox"
                      className="w-4 h-4 mt-0.5 accent-brand"
                      checked={selected.has(c.id)}
                      onChange={(e) => set([c.id], e.target.checked)}
                      aria-label={`Include ${c.objectTitle}`}
                    />
                    <div className="flex-1 min-w-0 grid gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-[13.5px]">{c.objectTitle}</b>
                        <span className="text-xs text-gray-600">{KIND[c.kind]} · {c.fields.map((f) => f.label).join(', ')}</span>
                        {c.visible ? <Chip tone="info">Students can see</Chip> : <Chip>Hidden</Chip>}
                      </div>
                      {c.warnings.filter((w) => w !== 'Students can see this.').map((w) => (
                        <span key={w} className="text-[12.5px] text-amber-900">⚠ {w}</span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenId(openId === c.id ? null : c.id)}
                      aria-expanded={openId === c.id}
                      className="text-brand font-bold text-[12.5px] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                    >
                      {openId === c.id ? 'Hide' : 'Compare'}
                    </button>
                  </div>
                  {openId === c.id && (
                    <div className="px-3 pb-3">
                      <Compare fields={c.fields} left={compareLabels?.left} right={compareLabels?.right} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/** What happened, after applying: counts, and every item that was not changed with why. */
export function Outcomes({ outcomes, changes }: { outcomes: ApplyOutcome[]; changes: ProposedChange[] | null }) {
  const ok = outcomes.filter((o) => o.ok).length
  const failed = outcomes.filter((o) => !o.ok)
  const title = (id: string) => {
    const c = changes?.find((x) => x.id === id)
    return c ? `${c.courseLabel}: ${c.objectTitle}` : id
  }
  return (
    <div className="grid gap-3">
      {failed.length === 0 ? (
        <Callout tone="ok">All {ok} changes were saved and checked in Canvas. Undo them any time from Recent changes.</Callout>
      ) : (
        <Callout tone="warn">{ok} of {outcomes.length} changes were saved and checked. {failed.length === 1 ? '1 was not:' : `${failed.length} were not:`}</Callout>
      )}
      {failed.length > 0 && (
        <ul className="grid gap-1.5 text-[13px]">
          {failed.map((f) => (
            <li key={f.changeId} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
              <b>{title(f.changeId)}</b>
              <div className="text-gray-800 selectable">{f.message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
