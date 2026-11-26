# ai-log.md

Tool: Claude Code (desktop app), driven in plan-then-build steps. The full session can be exported from the app and attached here; the log below lists the prompts in order with what each produced.

## Prompts (condensed, in order)

1. Shared the assignment brief; asked to initialise git and a React app in the project folder, said we are starting from scratch and will author the schemas ourselves, and asked for a step-by-step plan. -> Claude wrote a plan (own renderer, Vite + Vitest, zero-dependency mock API, Docker compose, stash-and-restore for hidden values) which I approved.
2. "What should I ask them before starting?" then "draft me a short email". -> 13 candidate questions, trimmed to 8 with explicit defaults.
3. "Let's take up the possible default as we did not receive any files/info from interviewer. Let's start now." -> scaffold attempt.
4. Pasted terminal errors while debugging `npm install` on a restricted network, until the install worked.
5. "Just give me commands for creating all and folder structure ... or can we use mock data like a file itself in frontend, suggest which the interviewer might look for." -> Claude advised a real mock API because the brief requires `docker compose`, 422 mapping and `GET /forms/{id}`.
6. "Yes, continue" -> three schemas and the mock API.
7. "Yes, engine" -> conditions, visibility + cycle detection, validation, submit/422 mapping, draft sanitising, 16 unit tests.
8. "Yes, UI" -> components, autosave, submit flow; verified in a browser.
9. "Yes, Docker" -> Dockerfiles and compose; verified the stack.
10. "Yes, docs" -> spec.md, plan.md, README.md, this file.

## Where the AI was wrong, and how I caught it

Everything here happened; nothing is invented.

1. **Plan timings were guesses.** The first plan gave per-step time estimates before anything had been run. They were estimates, not measurements, so I treated them as rough and tracked actual progress instead.
2. **CLAUDE.md claimed tests that did not exist.** While writing CLAUDE.md, Claude stated that the tests "include `jest-axe` checks". I had `jest-axe` in `package.json`, but a grep for `axe` in `src/` returned nothing and there was only one test file (engine tests). The brief requires component and accessibility tests, so this was also a real gap. I corrected CLAUDE.md and wrote `FormRenderer.test.tsx` (axe on all three schemas, conditional show/hide with value restore, error announcement and focus, draft restore, 422 mapping).
3. **First component tests were wrong in two ways.** (a) `toHaveNoViolations` is not registered by default, so axe assertions would not have worked until I added `expect.extend` in `src/test/setup.ts`. (b) The first 422 test submitted the complaint form without the required "Your name" field, so client validation blocked the request and the mock was never called. The first draft of that test also wrapped its assertions in `if (submitForm.mock.calls.length > 0)`, which would have passed vacuously; I removed the guard and asserted that the call happens. I caught both from the failing run (`expected vi.fn() to be called 1 times, but got 0`) and by checking the schema's `requiredWhen` rules.
4. **Lint warning left open.** `oxlint` reports `set-state-in-effect` in `App.tsx` (resetting `schema` and `error` inside an effect). It is a warning, not a failure, and behaviour is correct, so I left it and noted it as a follow-up.

## How I verified AI output

- Unit and component tests (23) against the real schemas (not mocks), so a schema or engine change that breaks behaviour fails; `jest-axe` runs on all three rendered schemas.
- `tsc` type check and production build.
- Ran the app in a browser: empty submit (summary focus, `aria-invalid`), 422 on a repeating row, draft restore after refresh, circular-dependency warning, and the Docker stack.
- Docker: built from a clean copy of the tracked files, both services healthy, form rendered from the API on :3000. Port 4000 was occupied by a leftover local dev server, so that check ran with the API on :4001; the compose file in the repo is unchanged.
- Not yet verified with a real screen reader (listed as cut in plan.md).
