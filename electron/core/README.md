# Shane Panter's Canvas client

`canvas.ts`, `objects.ts` and `types.ts` are copied from Shane K. Panter's
[edutools](https://github.com/shanep/edutools) (`packages/core/src`, commit
`01262da0a3bc2a3f67b59ba93b44900a272a0176`, 3 November 2026). They are MIT-licensed; the
licence is in `LICENSE` beside them and must stay with them.

`canvas.ts` is the only code in this app that talks HTTP to Canvas. It handles the token,
pagination, Canvas's rate limits (429 and backoff) and retries.

## Changes from the original

- `putJson`, `postJson` and `deleteJson` at the end of the `CanvasLMS` class, so the desktop
  tools can change any kind of object through one path. Marked "Added for edutools desktop".

Nothing else is changed. When Shane's copy improves, copy the three files again and re-add the
three methods.

## Not copied yet

Shane's course-folder engine (`course.ts`, `publish.ts`, `publisher.ts`, `dates.ts`, `verify.ts`,
`audit.ts` and friends) is what the "Course folder tools" screens will use. It needs markdown,
TOML and CSS-inlining packages, so it comes in with those screens rather than now.
