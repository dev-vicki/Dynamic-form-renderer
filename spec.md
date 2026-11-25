# spec.md

## 1. Problem, restated

A platform ships registration and survey forms as JSON configuration, so a new form needs no code change. We need a React (TypeScript) renderer that, given a schema, produces a working form that:

1. renders text, number, date, select, multi-select, checkbox and repeating-group fields;
2. shows/hides fields and makes them required conditionally on other fields;
3. validates required, min/max, regex and cross-field rules, with inline errors announced to screen readers;
4. autosaves a draft to `localStorage`, restores it on refresh, and shows a visible "saved" indicator;
5. submits to a mock API and maps server-side (422) field errors onto the right fields, including fields inside repeating rows;
6. renders three schemas (household, vaccination-visit, complaint) with no per-form code;
7. is fully usable with a keyboard and a screen reader.

It must start with a single `docker compose up`. One schema contains a circular visibility dependency; one has a repeating group nested in a conditional section.

## 2. The headline answer: hidden fields

**When a field becomes hidden**, its value is *kept in form state* (and in the draft) but is treated as **absent**:

- it is **not validated** (a hidden required field never blocks submit);
- it is **not sent** on submit (the payload is built from visible fields only);
- other conditions that read it see it as **empty** (a hidden field cannot drive the visibility of another field, which keeps the logic consistent and acyclic in practice);
- it is removed from the DOM, so it is not in the tab order or the accessibility tree.

**When it is shown again**, the previously entered value **reappears unchanged**, because it was never deleted. Example: choose "Rented", enter rent 12000, switch to "Owned" (rent hidden, not submitted), switch back to "Rented": 12000 is still there.

*Reasoning.* Accidentally flipping a toggle should not destroy a long answer. The cost of the alternative (clear on hide) is silent data loss; the cost of keeping is that stale values exist in state, which we neutralise by never submitting or validating them. This also applies to a whole hidden section or repeating group: its rows are preserved while hidden and are not submitted. It is covered by the test "hidden value is kept in state, excluded from submit and validation, and restored on re-show".

## 3. Ambiguities and how I resolved them

| # | Ambiguity | Resolution | Why |
|---|-----------|------------|-----|
| 1 | The brief says `candidate/mock-api` and `data/` are provided; none were received. | I authored the three schemas and a mock API to match the brief's description (nested group in a conditional section, a circular dependency, 422s). If the real files arrive they should drop in unchanged. | Cannot block on files that are missing; the assignment allows only one clarification batch, so I stated defaults instead. |
| 2 | Schema format is undefined. | Field `type`: `text, number, date, select, multiselect, checkbox, section, group`. Per field: `required`, `visibleWhen`, `requiredWhen`, `validation`, `options`, `fields`, `repeat{min,max}`. Conditions: `{field, op, value}` combined with `all`/`any`; ops `eq neq in notIn gt gte lt lte contains filled empty` (default `eq`). | Small, declarative, covers every requirement; easy to extend. |
| 3 | Value of a hidden field | See section 2. | |
| 4 | Is a hidden required field validated? | No. `requiredness` is only evaluated for visible fields. | A user cannot fill what they cannot see. |
| 5 | Circular visibility (`escalate` shows when `escalationReason` is filled; `escalationReason` shows when `escalate` is true) | Detected statically (strongly connected components of the `visibleWhen` dependency graph, including child-to-section edges). Fields on a cycle are **always shown** and a visible configuration warning is rendered. | Failing closed (hiding both) would make the form unusable and impossible to fix from the UI; failing open keeps the user able to complete it, while the warning flags the config bug. It never loops. |
| 6 | Which field does a condition inside a repeating row refer to? | The row's own fields first, then the form root. | Lets `occupation` depend on the same row's `isEarning`, and a reaction's date compare to the root `visitDate`. |
| 7 | Are `section` children stored nested or flat? | Flat (same scope as the section). Sections are presentational containers with their own visibility. | Matches server paths such as `reactions[0].severity` and keeps drafts simple. |
| 8 | "End date after start date": strict or inclusive? | Strict for `after`/`before`; `onOrAfter`/`onOrBefore` are available for inclusive rules (used for reaction onset vs visit date). If the other date is empty the rule is skipped (required handles absence). | Brief says "after"; explicit inclusive variants avoid ambiguity per field. |
| 9 | When are errors shown? | On blur for that field, and for every field on submit; once shown they update live as the user types. | Avoids shouting at users mid-typing while still being responsive. |
| 10 | How are errors announced? | Each inline error is a `role="alert"` paragraph referenced by `aria-describedby`, with `aria-invalid` on the control. On failed submit, focus moves to an error summary whose entries link to each field. Save status is a polite live region. | Inline alerts announce as they appear; summary gives one place to review all problems. Known trade-off: on submit some errors may be announced twice (summary focus + alerts). |
| 11 | Draft key and staleness | Key is `form-draft:<formId>`. On restore the draft is sanitised against the current schema: unknown keys and wrongly typed or no-longer-valid option values are dropped, matching values kept, minimum group rows re-created. Corrupt JSON is ignored. | Schemas can change between visits; restoring blindly could crash or submit junk. |
| 12 | Draft lifecycle | Saved 500 ms after the last change (debounced), only after a real change. Cleared on successful submit. "Discard draft and start over" clears it explicitly. Two tabs: last write wins. | Simple and predictable. |
| 13 | 422 shape and paths | `{message, errors:[{field, message}]}`; `field` uses bracket paths (`members[1].name`); dotted indexes (`members.1.name`) are also normalised. Errors for paths that are not currently visible fields are shown in the summary rather than dropped. | Server and client must agree on addressing rows; never silently swallow a server error. |
| 14 | Server error vs client error on the same field | Client error is shown first; a server error clears as soon as the user edits that field. Removing a repeating row clears touched/server state for that group because indexes shift. | Prevents errors pointing at the wrong row. |
| 15 | Group row limits | `repeat.min` rows are created up front and enforced ("Add at least 1 member"); `repeat.max` disables the Add button. | |
| 16 | Dates and numbers | Dates are ISO `YYYY-MM-DD` strings compared lexically (no time zones). Numbers are stored as numbers; empty is `undefined`. | Avoids time-zone bugs for date-only data. |
| 17 | Required checkbox | Must be checked. Optional checkboxes submit `false` when unchecked. | |
| 18 | Submit failures that are not 422 | Show an alert, keep the form and the draft intact, allow retry. | Network errors must never lose user input. |
| 19 | API base URL | Baked at build time as `http://localhost:4000` (the browser, not the container, calls the API). Override with `VITE_API_URL`. | Simplest working compose setup. |

## 4. Explicitly out of scope

- Authentication/authorisation, multi-user drafts, server-side draft storage, or resuming drafts across devices.
- Encrypting drafts. Drafts are plain text in `localStorage` and may contain personal data; they are cleared on submit, but a shared computer is a risk.
- Internationalisation/localisation and right-to-left layouts.
- Dependent options (a select whose options change with another field), computed fields, async/remote validation, file upload, rich text.
- A form-builder/editor UI, schema versioning/migration beyond the sanitising restore, and a formal JSON Schema for the config.
- Offline submit queueing and retry/backoff.
- Visual polish and responsive design beyond a usable single column.
- End-to-end browser tests (covered instead by unit/component tests plus manual checks).
