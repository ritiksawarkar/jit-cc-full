# Client (React + Vite)

Frontend app for JIT CC Full.

This module provides:

- Compiler workspace UI (editor, input/output, terminal-like interactions).
- Student and admin authentication flows.
- Event join, timer, and participation views.
- Admin-facing navigation entry points.
- Certificate verification and dashboard routes.

## Stack

- React 18
- Vite
- Zustand (state)
- React Router
- Axios
- Monaco Editor
- Framer Motion / GSAP

## Requirements

- Node.js 18+
- npm 9+
- Backend running on `http://127.0.0.1:9009` (default)

## Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Available variable:

- `VITE_API_URL`: production API base URL (example: `http://127.0.0.1:9009`)

Notes:

- In development, API utility currently defaults to `http://127.0.0.1:9009`.
- In production builds, `VITE_API_URL` is used.

## Install and Run

```bash
npm install
npm run dev
```

Default local URL:

- `http://127.0.0.1:5173`

## Scripts

- `npm run dev`: start Vite dev server.
- `npm run build`: create production build.
- `npm run preview`: preview built app.

## Main Routes

- `/compiler`: coding workspace.
- `/dashboard`: protected dashboard.
- `/admin/login`: admin auth page.
- `/admin/dashboard`: protected admin dashboard.
- `/reset-password`: reset token flow.
- `/certificates/verify`: public certificate verification page.
- `/unauthorized`: RBAC rejection page.

## Folder Overview

- `src/components/`: reusable UI components.
- `src/pages/`: route-level pages.
- `src/services/api.js`: API client and request wrappers.
- `src/store/useCompilerStore.js`: central app store.
- `src/lib/`: language maps and helper utilities.
- `public/certificate-assets/`: certificate rendering assets.

## Build Notes

- Ensure backend URL is reachable from deployed frontend.
- Set `VITE_API_URL` before build for production deployment.
- Keep secrets out of client env files; only expose public-safe values.
