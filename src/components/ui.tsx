/**
 * Small pieces every screen uses, in the house style of Canvas Extractor Tools and Rubric
 * Creator: Boise State blue, rounded-xl buttons, one primary action per step.
 */
import React from 'react'
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import type { FieldChange, Progress } from '../shared/api'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'

export function Button({
  variant = 'primary', className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'link' }) {
  const styles = {
    primary: 'bg-brand text-white hover:bg-brand-dark px-4 py-2.5 rounded-xl font-bold text-sm',
    ghost: 'border-2 border-brand text-brand hover:bg-brand-tint px-4 py-2 rounded-xl font-bold text-sm',
    danger: 'border-2 border-red-700 text-red-700 hover:bg-red-50 px-4 py-2 rounded-xl font-bold text-sm',
    link: 'text-brand font-bold text-sm underline-offset-2 hover:underline px-0.5',
  }[variant]
  return (
    <button
      type="button"
      {...props}
      className={`${styles} ${FOCUS} transition disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    />
  )
}

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'plain' | 'brand'

const CHIP: Record<Tone, string> = {
  ok: 'bg-green-100 text-green-900',
  warn: 'bg-amber-100 text-amber-900',
  bad: 'bg-red-100 text-red-900',
  info: 'bg-blue-100 text-blue-900',
  plain: 'bg-gray-100 text-gray-800',
  brand: 'bg-brand text-white',
}

export function Chip({ tone = 'plain', children, className = '' }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 text-[11px] font-black rounded-full px-2 py-0.5 whitespace-nowrap ${CHIP[tone]} ${className}`}>{children}</span>
}

export function Callout({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info'; children: React.ReactNode }) {
  const style = {
    ok: 'bg-green-50 border-green-200 text-green-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    bad: 'bg-red-50 border-red-200 text-red-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
  }[tone]
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle
  return (
    <div className={`flex items-start gap-2.5 p-3 border rounded-xl text-[13px] ${style}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 selectable">{children}</div>
    </div>
  )
}

export function Panel({ title, children, actions }: { title: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** The numbered step bar at the top of every task. */
export function Steps({ names, at }: { names: string[]; at: number }) {
  return (
    <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0, 1fr))` }} aria-label="Steps">
      {names.map((n, i) => (
        <li
          key={n}
          aria-current={i === at ? 'step' : undefined}
          className={`border-t-4 pt-1.5 text-[12.5px] font-bold ${i < at ? 'border-green-600 text-green-700' : i === at ? 'border-brand text-brand' : 'border-gray-200 text-gray-500'}`}
        >
          {i + 1} · {n}
        </li>
      ))}
    </ol>
  )
}

/** "In Canvas now" next to "After this change", one row per field. */
export function Compare({ fields, left = 'In Canvas now', right = 'After this change' }: { fields: FieldChange[]; left?: string; right?: string }) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full min-w-[520px] text-[12.5px] border-collapse selectable">
        <thead>
          <tr className="bg-gray-50 text-gray-600 text-left">
            <th className="font-bold px-3 py-1.5 w-28" scope="col">Field</th>
            <th className="font-bold px-3 py-1.5 border-l border-gray-200" scope="col">{left}</th>
            <th className="font-bold px-3 py-1.5 border-l border-gray-200" scope="col">{right}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.field} className="border-t border-gray-200 align-top">
              <th scope="row" className="px-3 py-1.5 text-left font-semibold text-gray-700">{f.label}</th>
              <td className="px-3 py-1.5 border-l border-gray-200 bg-red-50 text-red-900 whitespace-pre-wrap break-words">{f.beforeText || <i className="text-gray-500">(nothing)</i>}</td>
              <td className="px-3 py-1.5 border-l border-gray-200 bg-green-50 text-green-900 whitespace-pre-wrap break-words">{f.afterText || <i className="text-gray-500">(nothing)</i>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProgressBar({ progress, fallback }: { progress: Progress | null; fallback: string }) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 5
  return (
    <div className="grid gap-2" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-[13px] text-gray-800">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {progress?.label ?? fallback}
      </div>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
        <div className="h-full bg-brand transition-all" style={{ width: `${Math.max(5, pct)}%` }} />
      </div>
    </div>
  )
}

/** Electron wraps errors from the main process; take the wrapper off. From Extractor Tools' ErrorText. */
export function cleanError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw)
  return text.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^(?:[A-Z]\w*)?Error:\s*/, '').trim() || 'Something went wrong.'
}

export function TextField({ id, label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  return (
    <label htmlFor={id} className="grid gap-1 text-[13px] font-bold text-gray-800">
      {label}
      <input id={id} {...props} className={`border-2 border-gray-400 rounded-lg px-2.5 py-1.5 font-normal text-[13px] bg-white ${FOCUS} focus:border-brand ${props.className ?? ''}`} />
      {hint && <span className="font-normal text-xs text-gray-600">{hint}</span>}
    </label>
  )
}

export function CheckRow({ id, checked, onChange, title, detail, disabled, badge }: { id: string; checked: boolean; onChange(v: boolean): void; title: string; detail?: React.ReactNode; disabled?: boolean; badge?: React.ReactNode }) {
  return (
    <label htmlFor={id} className={`flex gap-3 items-start p-3 rounded-xl border border-gray-200 bg-gray-50 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input id={id} type="checkbox" className="w-4 h-4 mt-0.5 accent-brand" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="grid gap-0.5 min-w-0">
        <span className="text-[13.5px] font-bold text-gray-900 flex flex-wrap items-center gap-2">{title}{badge}</span>
        {detail && <span className="text-[12.5px] text-gray-700">{detail}</span>}
      </span>
    </label>
  )
}

export const newJobId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
