import { describe, expect, it } from 'vitest'
import { datedTitle, daysBetween, isWithin, moduleWeek, shiftIso, stripDateSuffix, weekLabel, weekOf, weekStart } from '../electron/ipc/termMath'

const zone = 'America/Boise'
const term = { zone, firstMonday: '2027-01-11', breakWeek: '' }
const withBreak = { zone, firstMonday: '2027-01-11', breakWeek: '2027-03-22' }

describe('shifting dates', () => {
  it('counts days between the two first Mondays', () => {
    expect(daysBetween('2026-01-12', '2027-01-11', zone)).toBe(364)
  })

  it('keeps 11:59 PM as 11:59 PM across the start of daylight saving time', () => {
    // Sun Mar 1, 2026, 11:59 PM MST = 06:59 UTC Mar 2. Moving 2 weeks lands in MDT (UTC-6).
    expect(shiftIso('2026-03-02T06:59:00Z', 14, zone)).toBe('2026-03-16T05:59:00Z')
  })

  it('moves a whole term forward on the same weekday', () => {
    // Lab 5: Sun Feb 15, 2026, 11:59 PM MST → Sun Feb 14, 2027, 11:59 PM MST
    expect(shiftIso('2026-02-16T06:59:00Z', 364, zone)).toBe('2027-02-15T06:59:00Z')
  })
})

describe('weeks', () => {
  it('starts each week at midnight on its Monday', () => {
    expect(weekStart(5, term).toISODate()).toBe('2027-02-08')
    expect(weekStart(5, term).hour).toBe(0)
  })

  it('skips the break week', () => {
    expect(weekStart(10, withBreak).toISODate()).toBe('2027-03-15')
    expect(weekStart(11, withBreak).toISODate()).toBe('2027-03-29')
    expect(weekOf('2027-03-24', withBreak)).toBeNull()
    expect(weekOf('2027-03-30', withBreak)).toBe(11)
    expect(weekOf('2027-01-18', withBreak)).toBe(2)
    expect(weekOf('2027-01-04', withBreak)).toBeNull()
  })

  it('labels a week Monday to Sunday', () => {
    expect(weekLabel(1, term)).toBe('January 11 – January 17')
    expect(weekLabel(5, term)).toBe('February 8 – February 14')
  })
})

describe('module titles', () => {
  it('finds the week a module names', () => {
    expect(moduleWeek('Module 5: Firewalls')).toBe(5)
    expect(moduleWeek('Week 12 - Review')).toBe(12)
    expect(moduleWeek('Start Here')).toBeNull()
    expect(moduleWeek('Module 0: Welcome')).toBe(0)
  })

  it('replaces dates already on the end instead of adding a second set', () => {
    expect(stripDateSuffix('Module 5: Firewalls (February 9 – February 15)')).toBe('Module 5: Firewalls')
    expect(stripDateSuffix('Module 5 (Feb 9 - 15)')).toBe('Module 5')
    expect(stripDateSuffix('Module 5: Firewalls (and VPNs)')).toBe('Module 5: Firewalls (and VPNs)')
    expect(datedTitle('Module 5: Firewalls (February 9 – February 15)', 5, term)).toBe('Module 5: Firewalls (February 8 – February 14)')
  })
})

describe('holidays', () => {
  it('knows when a due date lands in a range', () => {
    expect(isWithin('2027-03-28T05:59:00Z', '2027-03-22', '2027-03-28', zone)).toBe(true)
    expect(isWithin('2027-03-29T06:59:00Z', '2027-03-22', '2027-03-28', zone)).toBe(false)
  })
})
