# Dynamic Form Renderer

A config-driven React (TypeScript) form renderer. Forms come from JSON schemas, with conditional fields, cross-field validation, repeating groups, draft autosave and server-side (422) error mapping.

## Run it

```bash
docker compose up --build
```

Then open **http://localhost:3000**. The mock API is at http://localhost:4000. Stop with `Ctrl+C`, then `docker compose down`.

`--build` makes sure the images are rebuilt from the current code (a plain `docker compose up` reuses an older image if one exists).

Requires Docker Desktop running (start the app first), with ports 3000 and 4000 free. The first build downloads images and npm packages.

Forms: **Household Registration**, **Vaccination Visit**, **Citizen Complaint** (the nav links at the top; each is rendered from `data/*.json` with no form-specific code).

## Run the tests

```bash
cd web
npm install
npm test
```

Tests run with Vitest (jsdom). Other useful commands: `npm run build`, `npm run dev` (Vite on http://localhost:5173, expects the API on :4000, e.g. `node mock-api/server.js` from the repo root), `npm run lint`.

## Try these

- **Conditional fields**: Household: set Dwelling type to *Rented* and a rent field appears and becomes required; switch back and your rent value returns if you re-select *Rented*.
- **Cross-field**: Vaccination: put a Visit date, then a Next dose date before it.
- **Nested group in a conditional section**: Vaccination: tick *Patient had an adverse reaction*.
- **Circular dependency**: Complaint shows a configuration warning and keeps both escalation fields visible.
- **Drafts**: type something, wait for "Draft saved at …", refresh, and your input is back ("Draft restored"). Use *Discard draft and start over* to clear it.
- **422 mapping**: submit a valid form with any of these server-side triggers:
  - Household: mobile ending `0000000`; two members with the same name (error lands on `members[1].name`).
  - Vaccination: batch `B-0000`; patient name `Duplicate Patient`; a severe *rash* reaction.
  - Complaint: contact email ending `@blocked.test`; description containing "spam".

## Layout

```
data/        form schemas (mounted read-only into the API; not modified by the app)
mock-api/    dependency-free Node server (GET /forms, GET /forms/:id, POST /forms/:id/submissions)
web/         Vite + React + TS app
  src/engine/      pure logic: conditions, visibility + cycles, validation, submit mapping, drafts
  src/components/  FormRenderer, fields, repeating group, error summary, save indicator
  src/hooks/       draft load/save
docker-compose.yml
spec.md  plan.md  ai-log.md
```

## Documents

- [spec.md](spec.md): problem, every ambiguity and its resolution (including what happens to hidden fields), out of scope
- [plan.md](plan.md): milestones, schema interpretation, API sketch, test strategy, what was cut
- [ai-log.md](ai-log.md): how AI was used and where it was wrong

## Troubleshooting

- `UNABLE_TO_VERIFY_LEAF_SIGNATURE` during `docker compose up --build`: a network proxy is re-signing HTTPS. Build on a different network, or add your proxy's root CA to the build.
- Page loads but shows "Is the mock API running?": the browser can't reach http://localhost:4000. Check `docker compose ps`.
- Change the API URL the web build uses: `VITE_API_URL=http://host:port` (build arg in `docker-compose.yml`).
