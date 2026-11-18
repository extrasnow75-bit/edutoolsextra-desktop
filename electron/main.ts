/**
 * The main process: the window, and every Canvas request. The window (renderer) cannot reach the
 * network at all (see the Content-Security-Policy in electron.vite.config.ts); it asks for things
 * over IPC and draws the answers. The Canvas token is read here and never sent to it.
 *
 * Window and navigation rules follow Canvas Extractor Tools: our own page only, external links in
 * the person's real browser, and only http(s) links at that.
 */
import { app, BrowserWindow, ipcMain, safeStorage, shell, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import type { ApplyResult, FindRequest, RubricChange, SavedGroup, SessionCourse, TermRequest } from '../src/shared/api'
import { getSessionCourse, listMyCourses } from './ipc/courseList'
import { search } from './ipc/findReplace'
import { listHistory, markUndone, readBackup, record, takePreview } from './ipc/history'
import { type Op, plainError, runOps, undoOps } from './ipc/ops'
import { listRubrics, rubricOps } from './ipc/rubrics'
import { canvasClient, courseIdFromAddress, NoTokenError, normalizeSite } from './ipc/site'
import { encryptionAvailable, loadToken, readSettings, removeToken, saveToken, setDataDir, tokenHint, writeSettings } from './ipc/store'
import { preview as termPreview } from './ipc/termSetup'
import { isMonday } from './ipc/termMath'

const IS_MAC = process.platform === 'darwin'

/** External pages the app may open: Canvas sites and the help pages it links to. */
function isAllowedExternal(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (/(^|\.)instructure\.com$/i.test(u.hostname) || /(^|\.)boisestate\.edu$/i.test(u.hostname) || u.hostname === 'github.com')
  } catch {
    return false
  }
}

async function openExternalSafely(url: string): Promise<void> {
  if (isAllowedExternal(url)) await shell.openExternal(url)
}

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    // The app draws its own 36px blue title bar, as Extractor Tools and Rubric Creator do.
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'hidden',
    ...(IS_MAC
      ? { trafficLightPosition: { x: 13, y: 11 } }
      : { titleBarOverlay: { color: '#0033a0', symbolColor: '#ffffff', height: 36 } }),
    backgroundColor: '#f8fafc',
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalSafely(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return
    event.preventDefault()
    void openExternalSafely(url)
  })
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomLevel(readSettings().zoom)
  })

  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

/** Wrap a handler so any failure comes back as `{ ok: false, message }` in plain words. */
function safe<A extends unknown[], R>(fn: (e: IpcMainInvokeEvent, ...args: A) => Promise<R>) {
  return async (e: IpcMainInvokeEvent, ...args: A): Promise<R | { ok: false; message: string }> => {
    try {
      return await fn(e, ...args)
    } catch (error) {
      return { ok: false, message: error instanceof NoTokenError ? error.message : plainError(error) }
    }
  }
}

function progressTo(e: IpcMainInvokeEvent, jobId: string) {
  return (done: number, total: number, label: string) => {
    if (!e.sender.isDestroyed()) e.sender.send('progress', { jobId, done, total, label })
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:getZoom', () => readSettings().zoom)
ipcMain.handle('app:stepZoom', (e, delta: number) => {
  const level = Math.max(-3, Math.min(4, readSettings().zoom + Math.sign(delta) * 0.5))
  writeSettings({ zoom: level })
  e.sender.setZoomLevel(level)
  return level
})
ipcMain.handle('app:openExternal', (_e, url: string) => openExternalSafely(url))

// ─── Setup ────────────────────────────────────────────────────────────────────

ipcMain.handle('setup:status', () => ({
  site: readSettings().site,
  hasToken: loadToken() !== null,
  hint: tokenHint(),
  encryptionAvailable: encryptionAvailable(),
}))

ipcMain.handle('setup:saveSite', (_e, input: string) => {
  const site = normalizeSite(input)
  if (!site) return { ok: false, message: 'That is not a Canvas site address. It should look like yourschool.instructure.com' }
  // A different site means different courses: the session's courses belong to the old one.
  const changed = site !== readSettings().site
  writeSettings(changed ? { site, sessionCourses: [], groups: [] } : { site })
  return { ok: true, site }
})

async function checkToken(): Promise<'valid' | 'expired' | 'unknown'> {
  try {
    await canvasClient().getJson('/api/v1/users/self')
    return 'valid'
  } catch (error) {
    const status = (error as { status?: number }).status
    return status === 401 ? 'expired' : 'unknown'
  }
}

ipcMain.handle('setup:saveToken', safe(async (_e, token: string) => {
  if (!token.trim()) return { ok: false, message: 'Paste the token first.' }
  saveToken(token)
  return { ok: true, check: await checkToken() }
}))
ipcMain.handle('setup:removeToken', () => removeToken())
ipcMain.handle('setup:checkToken', () => checkToken())

// ─── Session courses and groups ───────────────────────────────────────────────

ipcMain.handle('session:load', () => {
  const s = readSettings()
  return { courses: s.sessionCourses, groups: s.groups }
})
ipcMain.handle('session:save', (_e, courses: SessionCourse[]) => {
  writeSettings({ sessionCourses: courses.slice(0, 100) })
})
ipcMain.handle('session:saveGroup', (_e, group: SavedGroup) => {
  const name = group.name.trim()
  const groups = readSettings().groups.filter((g) => g.name !== name)
  return writeSettings({ groups: [...groups, { name, courses: group.courses }].sort((a, b) => a.name.localeCompare(b.name)) }).groups
})
ipcMain.handle('session:deleteGroup', (_e, name: string) => writeSettings({ groups: readSettings().groups.filter((g) => g.name !== name) }).groups)

// ─── Courses ──────────────────────────────────────────────────────────────────

ipcMain.handle('courses:list', safe(async () => {
  const client = canvasClient()
  return { ok: true, site: client.endpoint, courses: await listMyCourses(client) }
}))

ipcMain.handle('courses:resolve', safe(async (_e, addresses: string[]) => {
  const client = canvasClient()
  const site = readSettings().site
  const out = []
  for (const address of addresses.map((a) => a.trim()).filter(Boolean).slice(0, 50)) {
    const id = courseIdFromAddress(address, site)
    if (!id) {
      out.push({ address, ok: false, message: `Not a course address on ${new URL(site).host}. It should look like ${site}/courses/12345` })
      continue
    }
    try {
      out.push({ address, ok: true, course: await getSessionCourse(client, id) })
    } catch (error) {
      const status = (error as { status?: number }).status
      out.push({ address, ok: false, message: status === 404 || status === 401 || status === 403 ? "Canvas can't find this course, or your account isn't in it." : plainError(error) })
    }
  }
  return out
}))

// ─── Applying a preview, for any tool ─────────────────────────────────────────

async function applyPreview(
  e: IpcMainInvokeEvent,
  args: { jobId: string; previewId: string; changeIds: string[]; title: string },
  tool: 'Find and replace' | 'Term setup',
  words: string,
) {
  const kept = takePreview(args.previewId)
  if (!kept) return { ok: false as const, message: 'That preview has expired. Run the search again.' }
  const ops: Op[] = args.changeIds.flatMap((id) => kept.ops.get(id) ?? [])
  if (ops.length === 0) return { ok: false as const, message: 'Nothing is selected.' }
  const { outcomes, applied } = await runOps(canvasClient(), ops, { onProgress: progressTo(e, args.jobId), htmlMarker: kept.htmlMarker })
  const entry = record({ tool, title: args.title, courses: kept.courses, outcomes, applied, htmlMarker: kept.htmlMarker, summaryWords: words })
  const result: ApplyResult = { historyId: entry.id, outcomes }
  return { ok: true as const, result }
}

// ─── Find and replace ─────────────────────────────────────────────────────────

ipcMain.handle('findReplace:search', safe(async (e, req: FindRequest) => {
  if (!req.find.trim()) return { ok: false, message: 'Type what to find.' }
  if (req.courseIds.length === 0) return { ok: false, message: 'Choose at least one course.' }
  return { ok: true, preview: await search(canvasClient(), req, progressTo(e, req.jobId)) }
}))
ipcMain.handle('findReplace:apply', safe((e, args) => applyPreview(e, args, 'Find and replace', 'items changed')))

// ─── Term setup ───────────────────────────────────────────────────────────────

ipcMain.handle('term:preview', safe(async (e, req: TermRequest) => {
  if (!isMonday(req.firstMonday, req.timezone)) return { ok: false, message: 'The first day of the new term should be a Monday.' }
  if (req.oldFirstMonday && !isMonday(req.oldFirstMonday, req.timezone)) return { ok: false, message: 'The first day of the old term should be a Monday.' }
  if (req.breakWeek && !isMonday(req.breakWeek, req.timezone)) return { ok: false, message: 'The break week should start on a Monday.' }
  if (req.courseIds.length === 0) return { ok: false, message: 'Choose at least one course.' }
  return { ok: true, preview: await termPreview(canvasClient(), req, progressTo(e, req.jobId)) }
}))
ipcMain.handle('term:apply', safe((e, args) => applyPreview(e, args, 'Term setup', 'items updated')))

// ─── Rubrics ──────────────────────────────────────────────────────────────────

ipcMain.handle('rubrics:list', safe(async (_e, courseId: string) => ({ ok: true, list: await listRubrics(canvasClient(), courseId) })))

ipcMain.handle('rubrics:save', safe(async (_e, args: { courseId: string; courseLabel: string; changes: RubricChange[] }) => {
  const client = canvasClient()
  // Read the list again, so a rubric linked in Canvas since the window loaded is not overwritten.
  const fresh = await listRubrics(client, args.courseId)
  const skipped = args.changes.filter((c) => fresh.rows.find((r) => r.assignmentId === c.assignmentId)?.rubricId !== c.fromRubricId)
  const go = args.changes.filter((c) => !skipped.includes(c))
  const ops = await rubricOps(client, args.courseId, args.courseLabel, fresh.rows, go)
  const { outcomes, applied } = await runOps(client, ops)
  for (const c of skipped) outcomes.push({ changeId: `${args.courseId}:rubric:${c.assignmentId}`, ok: false, message: 'Left alone: its rubric was changed in Canvas after this list loaded.' })
  const entry = record({ tool: 'Rubrics', title: `Rubrics in ${args.courseLabel}`, courses: [args.courseLabel], outcomes, applied, summaryWords: 'rubric links changed' })
  return { ok: true, result: { historyId: entry.id, outcomes } }
}))

// ─── Recent changes ───────────────────────────────────────────────────────────

ipcMain.handle('history:list', () => listHistory())
ipcMain.handle('history:undo', safe(async (_e, id: string) => {
  const entry = listHistory().find((h) => h.id === id)
  const backup = readBackup(id)
  if (!entry || !backup || entry.undone) return { ok: false, message: 'There is nothing to undo for this change.' }
  const { outcomes, applied } = await runOps(canvasClient(), undoOps(backup.applied), { htmlMarker: undefined })
  markUndone(id)
  const undo = record({ tool: 'Undo', title: `Undo: ${entry.title}`, courses: entry.courses, outcomes, applied, summaryWords: 'items put back' })
  return { ok: true, result: { historyId: undo.id, outcomes } }
}))

// ─── Start ────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  setDataDir(app.getPath('userData'), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (text) => safeStorage.encryptString(text),
    decrypt: (data) => safeStorage.decryptString(data),
  })
  mainWindow = createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit()
})
