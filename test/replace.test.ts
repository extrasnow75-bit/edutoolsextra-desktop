import { describe, expect, it } from 'vitest'
import { excerptAround, htmlToText, replaceInHtml, replaceInTitle, type ReplaceSpec } from '../electron/ipc/replace'

const spec = (over: Partial<ReplaceSpec>): ReplaceSpec => ({ mode: 'text', find: '', replace: '', matchLongerLinks: false, caseSensitive: false, ...over })

describe('text mode', () => {
  it('replaces words between tags only, never inside them', () => {
    const html = '<p class="Spring 2026">Welcome to Spring 2026.</p><a href="/spring-2026">Spring 2026 schedule</a>'
    const r = replaceInHtml(html, spec({ find: 'Spring 2026', replace: 'Spring 2027' }))
    expect(r.count).toBe(2)
    expect(r.value).toBe('<p class="Spring 2026">Welcome to Spring 2027.</p><a href="/spring-2026">Spring 2027 schedule</a>')
  })

  it('treats a non-breaking space as a space', () => {
    const r = replaceInHtml('<p>Due in Spring&nbsp;2026</p>', spec({ find: 'Spring 2026', replace: 'Spring 2027' }))
    expect(r.value).toBe('<p>Due in Spring 2027</p>')
  })

  it('matches across case unless asked not to', () => {
    expect(replaceInHtml('<p>spring 2026</p>', spec({ find: 'Spring 2026', replace: 'X' })).count).toBe(1)
    expect(replaceInHtml('<p>spring 2026</p>', spec({ find: 'Spring 2026', replace: 'X', caseSensitive: true })).count).toBe(0)
  })

  it('escapes the replacement so it cannot add tags', () => {
    const r = replaceInHtml('<p>A & B</p>', spec({ find: 'A & B', replace: '<b>C</b>' }))
    expect(r.value).toBe('<p>&lt;b&gt;C&lt;/b&gt;</p>')
  })

  it('leaves scripts and styles alone', () => {
    const html = '<style>.x{content:"Spring 2026"}</style><p>Spring 2026</p>'
    expect(replaceInHtml(html, spec({ find: 'Spring 2026', replace: 'S27' })).value).toBe('<style>.x{content:"Spring 2026"}</style><p>S27</p>')
  })

  it('does nothing for an empty search', () => {
    expect(replaceInHtml('<p>x</p>', spec({ find: '  ' })).count).toBe(0)
  })
})

describe('title mode (rename or renumber)', () => {
  it('uses whole-word edges so Lab 5 does not match Lab 50', () => {
    const t = spec({ mode: 'title', find: 'Lab 5', replace: 'Lab 6' })
    expect(replaceInTitle('Lab 5: Password hashing', t)).toEqual({ value: 'Lab 6: Password hashing', count: 1 })
    expect(replaceInTitle('Lab 50: Capstone', t).count).toBe(0)
    expect(replaceInHtml('<p>Finish Lab 5 before Lab 50.</p>', t).value).toBe('<p>Finish Lab 6 before Lab 50.</p>')
  })
})

describe('link mode', () => {
  const old = 'https://helpdesk.boisestate.edu/canvas-student-guide'
  const nw = 'https://www.boisestate.edu/ecampus/canvas-help'

  it('replaces in href and in text', () => {
    const html = `<a href="${old}">${old}</a>`
    const r = replaceInHtml(html, spec({ mode: 'link', find: old, replace: nw }))
    expect(r.count).toBe(2)
    expect(r.value).toBe(`<a href="${nw}">${nw}</a>`)
  })

  it('does not rewrite a longer address unless asked', () => {
    const html = `<a href="${old}-2">x</a><a href="${old}/submit">y</a>`
    expect(replaceInHtml(html, spec({ mode: 'link', find: old, replace: nw })).count).toBe(0)
    const longer = replaceInHtml(html, spec({ mode: 'link', find: old, replace: nw, matchLongerLinks: true }))
    expect(longer.value).toBe(`<a href="${nw}-2">x</a><a href="${nw}/submit">y</a>`)
  })

  it('matches the &amp; form of an address inside HTML and keeps that form', () => {
    const html = '<a href="https://x.edu/v?a=1&amp;b=2">v</a>'
    const r = replaceInHtml(html, spec({ mode: 'link', find: 'https://x.edu/v?a=1&b=2', replace: 'https://y.edu/v?c=3&d=4' }))
    expect(r.value).toBe('<a href="https://y.edu/v?c=3&amp;d=4">v</a>')
  })
})

describe('excerpts', () => {
  it('reads HTML as text and shows the words around a match', () => {
    const text = htmlToText('<p>Please read <a href="https://a.edu/x">this guide</a> before&nbsp;Sunday.</p>')
    expect(text).toContain('[link: https://a.edu/x]')
    expect(text).toContain('before Sunday.')
    expect(excerptAround('a'.repeat(200) + ' NEEDLE ' + 'b'.repeat(200), 'needle', 10)).toBe('…aaaaaaaaa NEEDLE bbbbbbbbb…')
  })
})
