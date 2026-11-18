/**
 * The contract between the window (renderer) and the main process. Both halves import this file,
 * so a change here shows up as a type error on whichever side has not caught up.
 *
 * The rule that shapes it: nothing here ever carries the Canvas token back to the window. The
 * token goes in once, through `credentials.saveToken`, and only `{ hasToken, hint }` comes out.
 */

// ─── Courses ──────────────────────────────────────────────────────────────────

export type CourseRole = 'teacher' | 'ta' | 'designer'

/** One course in the picker. The shape is Canvas Extractor Tools 1.2.0's, so the two pickers agree. */
export interface CourseChoice {
  id: string
  name: string
  code: string
  role: CourseRole
  /** The role's name in Canvas, for the badge (a custom role such as "Course Administrator"). */
  roleLabel: string
  /** Term name, or NO_TERM for masters and templates. */
  term: string
  termStart: string | null
  ended: boolean
  /** Canvas's own Blueprint flag. eCampus does not use these, so the picker calls them templates. */
  blueprint: boolean
}

/** A course the session is working on: just enough to show it and address it. */
export interface SessionCourse {
  id: string
  name: string
  code: string
  term: string
}

export interface SavedGroup {
  name: string
  courses: SessionCourse[]
}

export type Result<T> = ({ ok: true } & T) | { ok: false; message: string }

// ─── Setup ────────────────────────────────────────────────────────────────────

export interface SetupStatus {
  site: string
  hasToken: boolean
  /** Last four characters of the saved token, so people can tell which one is saved. */
  hint: string
  encryptionAvailable: boolean
}

export type TokenCheck = 'valid' | 'expired' | 'unknown'

// ─── Shared building blocks for every tool ───────────────────────────────────

/** One Canvas object a tool proposes to change. */
export type ObjectKind =
  | 'page'
  | 'assignment'
  | 'discussion'
  | 'announcement'
  | 'quiz'
  | 'syllabus'
  | 'module'
  | 'moduleItem'

/** One field of one object, before and after. Bodies are shown as plain-text excerpts. */
export interface FieldChange {
  field: string
  /** Human label: "Title", "Body", "Due", "Unlocks". */
  label: string
  beforeText: string
  afterText: string
}

export interface ProposedChange {
  /** Stable within one preview; the window sends back the ids it wants applied. */
  id: string
  courseId: string
  courseLabel: string
  kind: ObjectKind
  objectTitle: string
  /** Students can already see it (published). */
  visible: boolean
  fields: FieldChange[]
  /** Things the person should know before saying yes. */
  warnings: string[]
}

export interface Preview {
  previewId: string
  changes: ProposedChange[]
  /** Per course, anything that stopped part of the search (a 403 on quizzes, say). */
  problems: Array<{ courseLabel: string; message: string }>
}

export interface ApplyOutcome {
  changeId: string
  ok: boolean
  /** Why it was skipped or failed, in plain words. */
  message?: string
}

export interface ApplyResult {
  historyId: string
  outcomes: ApplyOutcome[]
}

/** Progress for long jobs, pushed to the window while a search or apply runs. */
export interface Progress {
  jobId: string
  done: number
  total: number
  label: string
}

// ─── Find and replace ─────────────────────────────────────────────────────────

export type FindMode = 'title' | 'link' | 'text'

export type FindScope =
  | 'titles'
  | 'pages'
  | 'assignments'
  | 'discussions'
  | 'announcements'
  | 'quizzes'
  | 'syllabus'
  | 'moduleItems'

export interface FindRequest {
  jobId: string
  courseIds: string[]
  courseLabels: Record<string, string>
  mode: FindMode
  find: string
  replace: string
  scopes: FindScope[]
  /** Links: also match longer links that start with `find`. */
  matchLongerLinks: boolean
  caseSensitive: boolean
}

// ─── Term setup ───────────────────────────────────────────────────────────────

export interface Holiday {
  label: string
  /** yyyy-mm-dd */
  start: string
  /** yyyy-mm-dd; same as start for a single day */
  end: string
}

export interface TermRequest {
  jobId: string
  courseIds: string[]
  courseLabels: Record<string, string>
  timezone: string
  /** yyyy-mm-dd, the Monday of week 1 in the new term. */
  firstMonday: string
  /** yyyy-mm-dd, the Monday of week 1 in the term the courses were copied from. */
  oldFirstMonday: string
  /** yyyy-mm-dd Monday of a break week, or '' for none. */
  breakWeek: string
  holidays: Holiday[]
  shiftDates: boolean
  setModuleUnlock: boolean
  dateModuleTitles: boolean
  addHolidayHeaders: boolean
}

// ─── Rubrics ──────────────────────────────────────────────────────────────────

export interface RubricRow {
  assignmentId: string
  title: string
  /** 'assignment' | 'discussion' | 'quiz' | 'new quiz' */
  type: string
  rubricId: string | null
  rubricTitle: string | null
  graded: boolean
  /** Has submissions; changing the rubric hides old rubric marks. */
  hasSubmissions: boolean
  published: boolean
}

export interface RubricOption {
  id: string
  title: string
  points: number
}

export interface RubricList {
  rows: RubricRow[]
  rubrics: RubricOption[]
}

export interface RubricChange {
  assignmentId: string
  /** The rubric the window showed, so a link changed in Canvas meanwhile is not overwritten. */
  fromRubricId: string | null
  /** null removes the rubric. */
  rubricId: string | null
}

// ─── Recent changes ───────────────────────────────────────────────────────────

export type HistoryTool = 'Find and replace' | 'Term setup' | 'Rubrics' | 'Undo'

export interface HistoryEntry {
  id: string
  tool: HistoryTool
  title: string
  courses: string[]
  summary: string
  status: 'done' | 'problems'
  /** ISO timestamp */
  when: string
  undoable: boolean
  undone: boolean
}

// ─── The bridge exposed as window.api ────────────────────────────────────────

export interface Api {
  app: {
    platform: string
    version(): Promise<string>
    stepZoom(delta: number): Promise<number>
    getZoom(): Promise<number>
    openExternal(url: string): Promise<void>
  }
  setup: {
    status(): Promise<SetupStatus>
    saveSite(site: string): Promise<Result<{ site: string }>>
    saveToken(token: string): Promise<Result<{ check: TokenCheck }>>
    removeToken(): Promise<void>
    checkToken(): Promise<TokenCheck>
  }
  session: {
    load(): Promise<{ courses: SessionCourse[]; groups: SavedGroup[] }>
    save(courses: SessionCourse[]): Promise<void>
    saveGroup(group: SavedGroup): Promise<SavedGroup[]>
    deleteGroup(name: string): Promise<SavedGroup[]>
  }
  courses: {
    list(): Promise<Result<{ site: string; courses: CourseChoice[] }>>
    /** Looks up pasted course addresses, one per line. */
    resolve(addresses: string[]): Promise<Array<{ address: string } & Result<{ course: SessionCourse }>>>
  }
  findReplace: {
    search(req: FindRequest): Promise<Result<{ preview: Preview }>>
    apply(args: { jobId: string; previewId: string; changeIds: string[]; title: string }): Promise<Result<{ result: ApplyResult }>>
  }
  term: {
    preview(req: TermRequest): Promise<Result<{ preview: Preview }>>
    apply(args: { jobId: string; previewId: string; changeIds: string[]; title: string }): Promise<Result<{ result: ApplyResult }>>
  }
  rubrics: {
    list(courseId: string): Promise<Result<{ list: RubricList }>>
    save(args: { courseId: string; courseLabel: string; changes: RubricChange[] }): Promise<Result<{ result: ApplyResult }>>
  }
  history: {
    list(): Promise<HistoryEntry[]>
    undo(id: string): Promise<Result<{ result: ApplyResult }>>
  }
  onProgress(callback: (p: Progress) => void): () => void
}
