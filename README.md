# edutools

A desktop app for Windows and macOS that gets Canvas courses ready for the term and keeps them
current, in one course or many at once. Built by the Boise State eCampus Center as a redesign of
the desktop side of Shane Panter's [edutools](https://github.com/shanep/edutools), in the style of
[Canvas Extractor Tools](https://github.com/extrasnow75-bit/canvas-extractor-tools) and
[Canvas Rubric Creator](https://github.com/extrasnow75-bit/Rubric-Creator-Desktop-App).

## With thanks to Dr. Shane Panter

This app stands on the work of **Dr. Shane K. Panter** of the Department of Computer Science at
Boise State University. He created [edutools](https://github.com/shanep/edutools), the command-line
tool and desktop app that showed how a Canvas course can be built, checked and kept current safely,
and shared it under the MIT licence. The Canvas connection at the heart of this app is his code,
and the careful habits throughout it (preview before writing, never overwrite what students can
see without asking, check that every change landed) come from his design. Thank you, Shane.

- Shane's edutools repository: [github.com/shanep/edutools](https://github.com/shanep/edutools)
- Shane on GitHub: [github.com/shanep](https://github.com/shanep)

## What it does

The app opens on **"What are you working on today?"**, with three paths.

| Path | In this version |
| --- | --- |
| **Build a new course** from a course blueprint doc, or AI-drafted from a design map plus links, readings and videos | Coming soon |
| **Get courses ready for a new term** | Move due dates, set module unlock dates, add dates to module titles, insert holiday headers |
| **Update existing courses** | Find and replace (rename or renumber, links and videos, any text); match rubrics to assignments |

Everything works on **one course or several**. The course picker is the one from Canvas
Extractor Tools 1.2.0, with checkboxes, an "every course in this term" box, several pasted course
addresses, and saved groups such as "CS 221 · all sections".

### The same safety rules in every tool

1. **Preview first.** Every change is listed, with what Canvas has now beside what it will have.
   Untick anything to leave it alone. Nothing is written until you say so.
2. **Nothing edited meanwhile is overwritten.** Each item is read again just before it is changed.
   If someone changed it in Canvas after the preview, it is left alone and reported.
3. **Checked afterwards.** Each change is read back from Canvas to confirm it landed.
4. **Undo.** Recent changes lists everything the app changed from this computer, with a backup of
   each change. Undo puts items back, but not over an edit made since.

### Coming next

From the agreed mockup, roughly in this order: the gradebook, Course Questions and broken-link
steps of term setup; AI-suggested term dates; Update a document everywhere (Google Drive to
each course's Files); Quick fix; Look at the course; Grade work; Shane's course-folder tools
(publish, plan, back up, start-of-term reset); and Build a new course.

## Setting it up

Open **Initial setup** and:

1. Check the **Canvas site**. It starts as `boisestatecanvas.instructure.com`.
2. Paste a **Canvas token**: in Canvas, Account → Settings → **+ New Access Token**. Use a token
   just for this app, with an expiry date. Choose **Save and check**.

The token is encrypted into the computer's keychain (macOS Keychain, Windows data protection),
decrypted only to make a Canvas request, and only ever sent to the Canvas site above. The window
part of the app cannot reach the network at all and is never given the token.

## Developing

```bash
npm install
npm run dev         # launch the app with hot reload
npm run typecheck   # both halves
npm test            # unit tests, plus whole tools against a pretend Canvas
npm run build       # build and package installers into release/
```

To release, rewrite `RELEASE_NOTES.md` for the new version, then push a tag
(`git tag v0.1.0 && git push origin v0.1.0`). The workflow builds the Windows and both macOS
installers and publishes the release. It needs no secrets.

### How it is put together

```
electron/
  main.ts           window, and one IPC handler per action
  preload.ts        the bridge: window.api, typed by src/shared/api.ts
  core/             Shane Panter's Canvas client (MIT), see core/README.md
  ipc/
    ops.ts          the one way anything is changed in Canvas: check, write, verify, undo
    findReplace.ts  search across courses; builds the preview
    replace.ts      the find-and-replace rules (pure, tested)
    termSetup.ts    term dates → date, module and header changes
    termMath.ts     week and date arithmetic in the course's time zone (pure, tested)
    rubrics.ts      rubric list and links
    history.ts      Recent changes and backups
    courseList.ts   the course list, adapted from Extractor Tools
    store.ts        settings and the encrypted token
src/
  shared/api.ts     the contract between the window and the main process
  screens/          Start, Tasks, TermSetup, FindReplace, Rubrics, History
  components/       CoursePicker, SetupPanel, CourseBanner, ChangeReview, ui
test/               tests, and fakeCanvas.ts, a pretend Canvas held in memory
```

Two rules shape it:

- **The window has no network access** (Content-Security-Policy `connect-src 'none'`) and is
  never given a credential. It asks the main process for things and draws the answers.
- **Previews stay in the main process.** The window sends back only the ids of the changes to
  apply, so what is written is exactly what was previewed.

### Credits

- `electron/core/canvas.ts`, `objects.ts`, `types.ts`: Dr. Shane K. Panter's edutools (Boise State
  University, Department of Computer Science), MIT licence (`electron/core/LICENSE`).
- The course list, picker filtering and selection rules, window security settings, build
  configuration and release workflow follow Canvas Extractor Tools.
