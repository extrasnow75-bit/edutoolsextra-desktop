/**
 * Recent changes: everything the app changed in Canvas from this computer, newest first, with
 * Done / Problems dots, filters by status and tool, and Undo.
 */
import React, { useCallback, useEffect, useState } from 'react'
import type { HistoryEntry } from '../shared/api'
import { Button, Callout, Panel, cleanError } from '../components/ui'

const DOT = { done: 'bg-green-500', problems: 'bg-red-500' }
const WORD = { done: 'Done', problems: 'Problems' }

export function History() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [status, setStatus] = useState<'all' | 'done' | 'problems'>('all')
  const [tool, setTool] = useState('All tools')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null)

  const load = useCallback(() => window.api.history.list().then(setEntries), [])
  useEffect(() => { void load() }, [load])

  const undo = async (id: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await window.api.history.undo(id)
      if (!res.ok) setMessage({ tone: 'bad', text: res.message })
      else {
        const failed = res.result.outcomes.filter((o) => !o.ok)
        setMessage(failed.length
          ? { tone: 'warn', text: `Put back ${res.result.outcomes.length - failed.length} items. ${failed.length} were left alone: ${failed.map((f) => f.message).join(' ')}` }
          : { tone: 'ok', text: `Put back all ${res.result.outcomes.length} items.` })
      }
      setConfirm(null)
      await load()
    } catch (e) {
      setMessage({ tone: 'bad', text: cleanError(e) })
    } finally {
      setBusy(false)
    }
  }

  const tools = ['All tools', ...new Set((entries ?? []).map((e) => e.tool))]
  const rows = (entries ?? []).filter((e) => (status === 'all' || e.status === status) && (tool === 'All tools' || e.tool === tool))

  return (
    <Panel title="Recent changes" actions={<span className="text-xs text-gray-600">Everything this app changed in Canvas from this computer, newest first</span>}>
      {message && <Callout tone={message.tone}>{message.text}</Callout>}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'done', 'problems'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12.5px] border ${status === s ? 'border-brand text-brand font-bold' : 'border-gray-300 text-gray-700'}`}>
            {s !== 'all' && <span className={`w-2 h-2 rounded-full ${DOT[s]}`} aria-hidden="true" />}
            {s === 'all' ? 'All' : WORD[s]}
          </button>
        ))}
        <select aria-label="Tool" value={tool} onChange={(e) => setTool(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-[12.5px] bg-white">
          {tools.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      {entries && rows.length === 0 && <p className="text-[13px] text-gray-700">{entries.length === 0 ? 'Nothing has been changed from this computer yet. Changes from every tool will be listed here, with a way to undo them.' : 'Nothing matches these filters.'}</p>}
      <ul className="grid gap-2">
        {rows.map((e) => (
          <li key={e.id} className="grid sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border border-gray-200 rounded-xl px-3 py-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${DOT[e.status]}`} title={WORD[e.status]} aria-label={WORD[e.status]} />
            <div className="min-w-0">
              <b className="text-[13.5px]">{e.title}</b>
              <div className="text-xs text-gray-600">{e.tool} · {e.courses.join(', ')} · {e.summary}{e.undone ? ' · undone' : ''}</div>
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">{new Date(e.when).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="flex gap-2 justify-end">
              {e.undoable && confirm !== e.id && <Button variant="ghost" className="!py-1 !px-3 text-xs" onClick={() => setConfirm(e.id)}>Undo</Button>}
              {confirm === e.id && (
                <span className="flex items-center gap-2 text-xs">
                  Put everything back?
                  <Button variant="danger" className="!py-1 !px-3 text-xs" disabled={busy} onClick={() => undo(e.id)}>{busy ? 'Undoing…' : 'Yes, undo'}</Button>
                  <Button variant="link" onClick={() => setConfirm(null)}>Cancel</Button>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
