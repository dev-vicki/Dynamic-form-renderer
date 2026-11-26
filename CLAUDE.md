# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Everything for the frontend runs from `web/`:

```bash
cd web
npm install
npm test                                   # vitest run (jsdom)
npx vitest run src/engine/engine.test.ts   # single file
npx vitest run -t "hidden value is kept"   # single test by name
npm run test:watch
npm run lint                               # oxlint
npm run build                              # tsc -b && vite build
npm run dev                                # Vite on :5173, expects API on :4000
```

Mock API (no dependencies, no install): `node mock-api/server.js` from the repo root (port 4000, reads `data/`, override with `PORT` / `DATA_DIR`).

Full stack: `docker compose up --build` → web on http://localhost:3000 (nginx), API on http://localhost:4000.

## Architecture

Three parts: `data/*.json` (form schemas), `mock-api/` (plain Node `http` server), `web/` (Vite + React 19 + TS). The browser calls the API directly; `VITE_API_URL` is baked in at build time (compose build arg, default `http://localhost:4000`), so the nginx container does not proxy `/api`.

**Constraints:** `data/` schemas are assignment-provided inputs mounted read-only into the API container; do not edit them. Adding a form must require no code change; avoid form-specific logic anywhere.

### The engine (`web/src/engine/`) is pure, UI-free logic

The renderer is a pipeline run on every change in `FormRenderer.tsx`:

`schema + values` → `resolveForm` (visibility.ts: builds a tree of `ResolvedNode`s with `visible`/`required`, nested `children` for sections and `rows` for repeating groups) → `validate` (flat map of path → message) → UI. `buildSubmission` and `mapServerErrors` (submit.ts) also consume the resolved tree.

Key semantics to preserve (full list with reasoning in `spec.md`):
- **Hidden fields keep their value in state and draft** but are treated as absent: not validated, not submitted, read as empty by other conditions, and restored unchanged when shown again.
- **Circular `visibleWhen` dependencies** are detected statically (SCCs); fields on a cycle are always shown and a `warnings` entry is rendered.
- Conditions inside repeating rows resolve against the row's own fields first, then the form root.
- Field paths use bracket notation (`members[1].name`) everywhere: values, errors, DOM ids, and the 422 payload (dotted indexes are normalised). Unmappable server errors go to the summary, never dropped.
- Schema field types: `text, number, date, select, multiselect, checkbox, section, group`; conditions `{field, op, value}` with `all`/`any`. Sections are flat (children share the section's value scope).

### UI and state

`FormRenderer.tsx` owns all state (values, touched, submitted, server errors, phase) and exposes it through `FormContext`; `Field.tsx` renders nodes recursively. Errors show after blur or submit; a failed submit focuses `ErrorSummary`. Resetting remounts `FormBody` via a changing `key`. Drafts (`hooks/useDraft.ts`) use key `form-draft:<formId>`, debounce 500 ms, and are sanitised against the current schema on restore.

Accessibility behaviour (`role="alert"` + `aria-describedby` + `aria-invalid`, polite live region for save status) is a graded requirement; component tests in `src/components/*.test.tsx` use Testing Library and `jest-axe`, so keep them passing when changing markup.

### Mock API

Deterministic 422 triggers live in `mock-api/server.js` `rules` (e.g. mobile ending `0000000`, batch `B-0000`, email ending `@blocked.test`). `README.md` lists them for manual testing.

## Docs

`spec.md` (ambiguities and resolutions), `plan.md`, `ai-log.md` are assignment deliverables; update `spec.md` when changing behaviour it documents.
