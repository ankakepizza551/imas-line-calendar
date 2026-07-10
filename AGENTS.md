# AGENTS.md

## Cursor Cloud specific instructions

### What this app is
Single-page React app (Vite) — a LINE group calendar ("グループ予定表"). It is a
**frontend-only** repo: there is no backend service in this repository.
- Data is stored in **Firebase Firestore**; config is hardcoded (public) in `src/firebase.js`
  for the real `imas-line--calendar` project. Firestore reads/writes work over the network
  with anonymous auth (no local emulator).
- Push notifications are sent by an **external Cloudflare Worker** (`WORKER_URL` in `src/App.jsx`),
  which lives outside this repo — Worker calls failing locally is expected and harmless.

### Commands
Standard scripts in `package.json`: `npm run dev` (Vite dev server on `http://localhost:5173`),
`npm run build`, `npm run preview`, `npm run lint`.

### Non-obvious gotchas
- **LINE LIFF login gate:** On startup `App.jsx` calls `liff.init(...)` and, when not logged in,
  `liff.login()`, which **redirects the browser to `access.line.me` (LINE OAuth)**. In a plain
  browser at `localhost` the calendar renders for a moment, then redirects away. Full LINE login
  requires a real LINE account (external credential not available in the VM).
- **To test the calendar + Firestore flow locally** without a LINE account, temporarily bypass the
  LIFF redirect (e.g. an uncommitted shim in the LIFF `useEffect` that sets a mock `currentUser`/
  `userId` + `signInAnonymously(auth)` and returns early when `window.location.hostname === 'localhost'`).
  This lets you open the day modal and add events; writes persist to the live Firestore.
  **Revert this shim before committing** — do not commit the bypass.
- **Lint currently fails** with pre-existing `react-hooks/refs` errors in `src/App.jsx`
  (`useRef(...).current` accessed during render). These are existing code issues, not env problems.
