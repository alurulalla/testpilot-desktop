# TestPilot Desktop (Electron)

A native desktop wrapper for the TestPilot app. It runs the existing TestPilot
(Next.js) server as a child process and shows it in a real desktop window —
**without touching or copying** the `TestPilot` source. It points at it via a path.

```
Lalla/
├── TestPilot/            ← your existing app (untouched)
└── testpilot-desktop/    ← this Electron wrapper
```

---

## Phase 1 — Run TestPilot as a desktop app (this repo does it now)

### Prerequisites
- The sibling **`../TestPilot`** app is set up: `npm install` done, and its **`.env`** is filled in (database URL, Clerk keys, LLM keys, etc.).
- Its dependencies (Postgres, etc.) are reachable — this wrapper just launches `npm run dev` in that folder.

### Run
```bash
cd testpilot-desktop
npm install          # installs Electron
npm run dev          # opens TestPilot in a desktop window
```
The window shows a splash, starts the app server in the background, then loads it. External links open in your real browser.

### Config (env vars)
| Var | Default | Meaning |
|-----|---------|---------|
| `TP_APP_DIR` | `../TestPilot` | path to the TestPilot app |
| `TP_PORT` | `3000` | port the app serves on |
| `TP_MODE` | `dev` | `dev` = `npm run dev`; `prod` = run a built server |

Example: `TP_APP_DIR=/path/to/TestPilot TP_PORT=3005 npm run dev`

---

## Phase 2 — Make it a real, self-contained desktop product
Phase 1 proves it *runs* as a desktop app, but it still depends on your cloud
setup (Postgres, Clerk). To ship a true offline/installable product, adapt a
**copy** of the app (so the original stays a SaaS) with these changes:

- [ ] **Database → SQLite.** Switch Prisma's provider to `sqlite` and point it at a file in the user's app-data dir. (Most of this is a schema/provider + connection-string change.)
- [ ] **Auth → drop Clerk.** A single-user desktop app has no multi-tenant login. Remove Clerk / replace with a local profile or license key; collapse "orgs" to one local workspace.
- [ ] **Storage → local files.** Point artifact storage (currently R2) at a local folder.
- [ ] **Worker → in-process.** Run the job worker inside the app process instead of a separate service.
- [ ] **LLM → local by default.** Default to Ollama (token-free/offline); allow cloud keys as an option.
- [ ] **Bundle Playwright's Chromium** into the installer (or download on first run).

### Packaging into an installer (.dmg / .exe)
1. In the app copy, set Next.js `output: 'standalone'` and build it.
2. Copy the standalone output into `testpilot-desktop/app-build/` (wired via `extraResources` in `package.json`).
3. `npm run dist:mac` / `npm run dist:win` → produces installers in `release/`.

> Heads-up on size: Electron (~150 MB) + Playwright's Chromium (~150 MB) makes a chunky installer. That's expected.

---

## What this wrapper does NOT change
- It never edits or copies `../TestPilot`.
- It launches that app's own `npm run dev` and just frames it in a window.
- All the Phase-2 "un-SaaS" work is meant to be done in a **separate copy**, keeping your cloud SaaS intact.
