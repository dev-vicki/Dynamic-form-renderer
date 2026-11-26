# plan.md

## Milestones (4-hour box)

| # | Milestone | Outcome |
|---|-----------|---------|
| 1 | Scaffold | Vite + React + TS, Vitest, Testing Library, jest-axe; one git repo |
| 2 | Schemas + mock API | Three schemas in `data/`, zero-dependency Node API with 422 rules |
| 3 | Engine | Conditions, visibility with cycle detection, validation, submit/422 mapping, draft sanitising (pure TS, unit-tested) |
| 4 | UI | Field components, repeating groups, error summary, autosave + indicator, submit flow |
| 5 | Docker | `docker compose up` starts API (:4000) and web (:3000) |
| 6 | Docs | spec, plan, README, ai-log |
| 7 | Component tests + a11y | Testing Library flows and a jest-axe check per schema (see status) |

## Status and what was cut

Done: milestones 1-7, with 16 engine unit tests and 7 component tests (jest-axe on all three schemas, conditional show/hide, error announcement and focus, draft restore, 422 mapping), and a manual browser pass (validation, summary focus, 422 on array rows, draft restore, cycle warning). The Docker stack was built from a clean copy of the tracked files (no `node_modules`): both containers reached healthy, schemas loaded, the 422 response worked and the web app rendered a form from the API.

Cut or incomplete, and why:
- **Manual keyboard and screen-reader pass** (VoiceOver/NVDA): structure follows standards (labels, fieldset/legend, aria-describedby, live regions, focus management) but has not been verified with a real screen reader.
- **Styling polish**: a clean, accessible, mobile-friendly layout was added, but no design system or dark mode.

## How I interpret the schema

A form is `{id, title, version, fields[]}`. A field is one of:

- **Leaf**: `text | number | date | select | multiselect | checkbox`, with `label`, optional `helpText`, `options`, `required`, `validation`.
- **section**: non-repeating container with `fields`; its own `visibleWhen`; children values stored flat.
- **group**: repeating container with `fields`, `repeat{min,max}`, `itemLabel`; value is an array of row objects. Rows form a new scope.

Logic is data, not code: `visibleWhen`/`requiredWhen` are conditions; `validation` holds `min, max, minLength, maxLength, pattern(+patternMessage), after, before, onOrAfter, onOrBefore, message`. Full decisions are in spec.md.

Pipeline: `values -> resolveForm (visibility, requiredness tree) -> validate / buildSubmission / mapServerErrors`. The UI renders the resolved tree; it contains no form-specific logic.

## API sketch (mock)

```
GET  /health
GET  /forms                    -> [{id,title}]
GET  /forms/:id                -> schema JSON            (404 if unknown)
POST /forms/:id/submissions    -> 201 {id, receivedAt}
                               -> 422 {message, errors:[{field, message}]}
                               -> 400 on invalid JSON body
```
Paths use brackets for rows: `members[1].name`. Deterministic 422 triggers (for demos and tests):
household: mobile ending `0000000`, duplicate member names; vaccination-visit: batch `B-0000`, patient `Duplicate Patient`, severe rash reaction; complaint: email ending `@blocked.test`, "spam" in the description.

## Test strategy

- **Unit (engine, Vitest)**: conditions, path helpers, hidden-value policy, per-row requiredness, repeat min, cross-field dates, nested group in conditional section, cycle detection, 422 mapping, draft sanitising. Uses the real `data/*.json` so schema edits that break behaviour fail tests.
- **Component (Testing Library + jest-axe, `FormRenderer.test.tsx`)**: conditional show/hide by user action, error announced and focus moved on submit, draft saved then restored after remount, 422 lands on the right field, add/remove row focus.
- **Accessibility**: jest-axe per schema *(next)*, plus a manual keyboard-only and screen-reader checklist.
- **Manual/E2E**: `docker compose up`, exercise all three forms in a browser.

## With one more day

1. Extend jest-axe to more states (errors showing, rows added), add add/remove-row focus tests, and do a real VoiceOver + NVDA pass; fix what they find.
2. Playwright E2E against the compose stack.
3. A JSON Schema for the config with load-time validation and friendly errors; schema version migration for drafts.
4. Dependent options, computed fields, and `requiredWhen` on groups.
5. Announce when fields appear/disappear due to conditions (polite live message), and de-duplicate submit announcements.
6. Optional draft encryption / session-only drafts for shared devices; cross-tab draft sync via the `storage` event.
7. Runtime config for the API URL (nginx proxy) so the image isn't tied to `localhost:4000`.
