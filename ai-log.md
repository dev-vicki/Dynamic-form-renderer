# ai-log.md

Tool: Claude Code (desktop app), driven in plan-then-build steps. The full session can be exported from the app and attached here; the log below lists the prompts in order with what each produced.

## Prompts (condensed, in order)

1. Shared the assignment brief; asked to initialise git and a React app in the project folder, said we are starting from scratch and will author the schemas ourselves, and asked for a step-by-step plan. -> Claude wrote a plan (own renderer, Vite + Vitest, zero-dependency mock API, Docker compose, stash-and-restore for hidden values) which I approved.
2. "What should I ask them before starting?" then "draft me a short email". -> 13 candidate questions, trimmed to 8 with explicit defaults.
3. "Let's take up the possible default as we did not receive any files/info from interviewer. Let's start now." -> scaffold attempt.
4. Pasted terminal errors (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) three times while debugging npm. -> see "where the AI was wrong" below.
5. "Just give me commands for creating all and folder structure ... or can we use mock data like a file itself in frontend, suggest which the interviewer might look for." -> Claude advised a real mock API because the brief requires `docker compose`, 422 mapping and `GET /forms/{id}`.
6. "Yes, continue" -> three schemas and the mock API.
7. "Yes, engine" -> conditions, visibility + cycle detection, validation, submit/422 mapping, draft sanitising, 16 unit tests.
8. "Yes, UI" -> components, autosave, submit flow; verified in a browser.
9. "Yes, Docker" -> Dockerfiles and compose; verified the stack.
10. "Yes, docs" -> spec.md, plan.md, README.md, this file.

## Where the AI was wrong, and how I caught it

*(Facts below happened in this session; add your own observations from the rest of your work.)*

1. **TLS diagnosis.** Claude first assumed the npm failure was a sandbox issue, then proposed exporting the macOS keychain certificates and `--use-system-ca`. Both fixes failed in my own terminal. I caught it because the fix did not change the error, and `openssl s_client` showed the certificate issuer was my office Fortinet firewall, whose root CA was not in the keychain; the real fix was changing network.
2. **Plan timings were guesses.** The first plan gave per-step time estimates before anything had been run. They were estimates, not measurements, so I treated them as rough and tracked actual progress instead.
3. *(Add: any case where generated code or tests were wrong, e.g. something a test, a type check, or a browser run exposed. In this session the engine tests and type check passed first run, and the browser run matched expectations, so I do not have another verified failure to report. Do not invent one.)*

## How I verified AI output

- Unit tests against the real schemas (not mocks), so a schema or engine change that breaks behaviour fails.
- `tsc` type check and production build.
- Ran the app in a browser: empty submit (summary focus, `aria-invalid`), 422 on a repeating row, draft restore after refresh, circular-dependency warning, and the Docker stack on :3000 / :4000.
- Not yet verified with a real screen reader or from a clean clone (listed as cut in plan.md).
