# Deployment and sharing guide

## What runs where

| Service | Image | Port | What it does |
|---|---|---|---|
| `mock-api` | `node:*-alpine` (see `mock-api/Dockerfile`) | 4000 | Serves schemas from `data/` (mounted read-only) and validates submissions (201 or 422) |
| `web` | multi-stage: `node:22-alpine` builds, `nginx:1.27-alpine` serves | 3000 → 80 | Static React bundle |

Your browser talks to both: it loads the app from :3000, and the app calls the API at :4000 (`VITE_API_URL`, baked in at build time).

## Why Docker, and why nginx

- **Docker** makes the reviewer's machine irrelevant: no Node version, no `npm install`, one command.
- **Multi-stage build** (`web/Dockerfile`): stage 1 installs Node and runs `npm run build` into `dist/`; stage 2 copies only `dist/` into a tiny nginx image. The final image has no Node, no source, no `node_modules`.
- **nginx** is a production static file server. `vite dev` is a development tool, not for serving. `web/nginx.conf` uses `try_files $uri /index.html` so deep links fall back to the app.
- **Compose** wires it together: `depends_on` + `healthcheck` makes the web container wait until the API answers `/health`; `./data:/data:ro` mounts the schemas so they are never copied or edited.

## Commands

```bash
docker compose up --build     # build images and start both services (open http://localhost:3000)
docker compose up -d          # same, in the background
docker compose ps             # status and health
docker compose logs -f web    # follow logs of one service
docker compose down           # stop and remove containers
docker compose build --no-cache   # force a clean rebuild
```

Changing the API URL (e.g. deploying on a server): edit `VITE_API_URL` in `docker-compose.yml` and rebuild with `--build`, because it is compiled into the JS bundle.

## Verify from a clean clone before sending

```bash
git clone <repo> /tmp/check && cd /tmp/check
docker compose up --build
# open http://localhost:3000, then:
cd web && npm install && npm test
```

## How to share it

1. Make sure nothing secret or heavy is committed: `git ls-files | grep -E "node_modules|dist"` must print nothing (`.gitignore` already excludes them).
2. Either push to a **private** GitHub/GitLab repo and add the interviewer as a collaborator, or zip it:

```bash
git archive --format=zip --output=../dynamic-form-renderer.zip HEAD
```

`git archive` only includes tracked files, so `node_modules` and build output are left out automatically.
3. In the email: link/zip, the one command (`docker compose up --build`), the URL (http://localhost:3000), the test command (`cd web && npm install && npm test`), and a pointer to `spec.md`, `plan.md`, `ai-log.md`.

## Optional: a public demo

Run the same compose file on any VM with Docker, set `VITE_API_URL` to `http://<server-ip>:4000`, open ports 3000/4000. To put both behind one domain, add an nginx `location /api/ { proxy_pass http://mock-api:4000/; }` and set `VITE_API_URL=/api`. Not required by the assignment.
