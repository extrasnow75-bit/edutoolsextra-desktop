/**
 * Date arithmetic for term setup. Pure functions, covered by test/termMath.test.ts.
 *
 * Every date is worked out in the course's time zone, never in UTC, because what people
 * care about is the wall clock: an assignment due Sunday at 11:59 PM must still be due Sunday at
 * 11:59 PM after it moves across the start or end of daylight saving time.
 */
import { DateTime } from 'luxon'

/** Calendar days from one yyyy-mm-dd date to another, counted in `zone`. */
export function daysBetween(from: string, to: string, zone: string): number {
  const a = DateTime.fromISO(from, { zone }).startOf('day')
  const b = DateTime.fromISO(to, { zone }).startOf('day')
  return Math.round(b.diff(a, 'days').days)
}

/** Move a Canvas timestamp by whole days, keeping its time of day in `zone`. */
export function shiftIso(iso: string, days: number, zone: string): string {
  const moved = DateTime.fromISO(iso, { setZone: false }).setZone(zone).plus({ days })
  return moved.toUTC().toISO({ suppressMilliseconds: true }) as string
}

export function isMonday(date: string, zone: string): boolean {
  const d = DateTime.fromISO(date, { zone })
  return d.isValid && d.weekday === 1
}

export interface TermShape {
  zone: string
  /** yyyy-mm-dd, Monday of week 1 */
  firstMonday: string
  /** yyyy-mm-dd Monday of a break week, or '' */
  breakWeek: string
}

/** Midnight at the start of the Monday of teaching week `week` (1-based), skipping the break. */
export function weekStart(week: number, term: TermShape): DateTime {
  let start = DateTime.fromISO(term.firstMonday, { zone: term.zone }).startOf('day').plus({ weeks: week - 1 })
  if (term.breakWeek) {
    const brk = DateTime.fromISO(term.breakWeek, { zone: term.zone }).startOf('day')
    if (start >= brk) start = start.plus({ weeks: 1 })
  }
  return start
}

/** The teaching week a date falls in, or null if it is before week 1 or in the break. */
export function weekOf(date: string, term: TermShape): number | null {
  const d = DateTime.fromISO(date, { zone: term.zone }).startOf('day')
  const first = DateTime.fromISO(term.firstMonday, { zone: term.zone }).startOf('day')
  if (d < first) return null
  if (term.breakWeek) {
    const brk = DateTime.fromISO(term.breakWeek, { zone: term.zone }).startOf('day')
    if (d >= brk && d < brk.plus({ weeks: 1 })) return null
    const weeks = Math.floor(d.diff(first, 'days').days / 7)
    return d >= brk ? weeks : weeks + 1
  }
  return Math.floor(d.diff(first, 'days').days / 7) + 1
}

/** "January 11 – January 17", the eCampus style for module titles: Monday to Sunday. */
export function weekLabel(week: number, term: TermShape): string {
  const start = weekStart(week, term)
  const end = start.plus({ days: 6 })
  return `${start.toFormat('MMMM d')} – ${end.toFormat('MMMM d')}`
}

/** "March 22 – March 26", or "January 18" for one day. */
export function rangeLabel(start: string, end: string, zone: string): string {
  const a = DateTime.fromISO(start, { zone })
  const b = DateTime.fromISO(end || start, { zone })
  return a.hasSame(b, 'day') ? a.toFormat('cccc, MMMM d') : `${a.toFormat('MMMM d')} – ${b.toFormat('MMMM d')}`
}

/**
 * The week number a module title names: "Module 5: …", "Week 5", "Unit 5". Null when there is
 * none, as for "Start Here" or "Instructor Resources", which therefore get no dates.
 */
export function moduleWeek(title: string): number | null {
  const m = /\b(?:module|week|unit)\s+(\d{1,2})\b/i.exec(title)
  return m ? Number(m[1]) : null
}

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'
const DAY = '\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?'
const DATE_SUFFIX = new RegExp(`\\s*\\(\\s*${MONTH}\\s+${DAY}\\s*[-–—]\\s*(?:${MONTH}\\s+)?${DAY}\\s*\\)\\s*$`, 'i')

/** The title without any "(February 9 – February 15)" already on the end. */
export function stripDateSuffix(title: string): string {
  return title.replace(DATE_SUFFIX, '').trimEnd()
}

/** The title with this week's dates on the end, replacing any dates already there. */
export function datedTitle(title: string, week: number, term: TermShape): string {
  return `${stripDateSuffix(title)} (${weekLabel(week, term)})`
}

/** True when a timestamp falls on any day from `start` to `end`, inclusive, in `zone`. */
export function isWithin(iso: string, start: string, end: string, zone: string): boolean {
  const d = DateTime.fromISO(iso, { setZone: false }).setZone(zone).startOf('day')
  const a = DateTime.fromISO(start, { zone }).startOf('day')
  const b = DateTime.fromISO(end || start, { zone }).startOf('day')
  return d >= a && d <= b
}

/** "Sun, Feb 14, 2027, 11:59 PM" in the course's zone, for previews. */
export function showDate(iso: string | null | undefined, zone: string): string {
  if (!iso) return '(none)'
  const d = DateTime.fromISO(iso, { setZone: false }).setZone(zone)
  return d.isValid ? d.toFormat('ccc, LLL d, yyyy, h:mm a') : iso
}
