# JIT CC Full

JIT CC Full is a full-stack coding platform with:

- Browser-based code editor and execution flow.
- Role-based auth for students and admins.
- Event participation with join codes and timed submissions.
- Problem selection lock/unlock flow for events.
- Leaderboard, rewards, and certificate verification workflows.
- Optional SMTP-based forgot-password delivery.

## Repository Structure

- `client/`: React + Vite frontend.
- `server/`: Express + MongoDB backend + Judge0/Gemini integrations.
- `docker-compose.yml`: Optional local Judge0 stack definition.
- `judge0.conf`: Judge0 service config used by Docker services.

## Tech Stack

- Frontend: React 18, Vite, Zustand, Axios, Framer Motion, Monaco Editor.
- Backend: Node.js, Express, Mongoose, JWT, Nodemailer.
- Code execution: Judge0 via RapidAPI host/key.
- AI assistance: Gemini API.

## Prerequisites

- Node.js 18+ (recommended 20+).
- npm 9+.
- MongoDB instance (local or Atlas).
- RapidAPI Judge0 credentials.
- Gemini API key.
- Optional: Docker Desktop (if you want local Judge0 services).

## Quick Start

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd jit-cc-full
npm install --prefix server
npm install --prefix client
```

### 2. Configure environment files

Create these files:

- `server/.env` from `server/.env.example`
- `client/.env` from `client/.env.example`

Minimum required server values:

- `PORT`
- `AUTH_JWT_SECRET`
- `MONGO_URI`
- `JUDGE0_HOST`
- `JUDGE0_API_KEY`
- `GEMINI_API_KEY`

Client value:

- `VITE_API_URL` (used in production build; dev points to localhost backend by default)

### 3. Start backend

```bash
npm run dev --prefix server
```

Server default URL:

- `http://127.0.0.1:9009`

### 4. Start frontend

```bash
npm run dev --prefix client
```

Client default URL:

- `http://127.0.0.1:5173`

## Main Routes

Frontend routes include:

- `/compiler`
- `/dashboard`
- `/admin/login`
- `/admin/dashboard`
- `/reset-password`
- `/certificates/verify`

Backend API root:

- `/api/*`

## API Surface Summary

Core endpoints:

- `POST /api/execute`
- `POST /api/ai-suggestions`
- `GET /api/health`

Auth:

- `POST /api/auth/register`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`

Problem and submissions:

- `GET /api/problems`
- `GET /api/problems/:problemId`
- `POST /api/submissions`
- `GET /api/submissions/user/:userId`
- `GET /api/submissions/problem/:problemId`

Event and leaderboard:

- `POST /api/events/join`
- `GET /api/events/my`
- `GET /api/events/:eventId/leaderboard`
- `GET /api/leaderboard`
- `POST /api/leaderboard`

Certificates and rewards:

- `GET /api/certificates/my`
- `GET /api/certificates/verify/:verificationCode`
- `GET /api/rewards/my-prizes`

Admin module:

- `GET /api/admin/overview`
- `GET /api/admin/events`
- `POST /api/admin/events`
- `POST /api/admin/problems`
- `POST /api/admin/events/:eventId/results/compute`
- `POST /api/admin/events/:eventId/results/finalize`

## Optional SMTP for Forgot Password

If SMTP is configured in `server/.env`, forgot-password links are emailed.
If SMTP is not configured, the API can fall back to returning the reset URL in response.

Important SMTP keys:

- `SMTP_ENABLED`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `EXPOSE_RESET_LINK_IN_RESPONSE`

## Seed Scripts

From repository root:

```bash
npm run seed:admin --prefix server
npm run seed:demo-certificate --prefix server
npm run seed:jit-hackathon --prefix server
```

## Optional Docker: Local Judge0 Stack

The repository includes Docker definitions for Judge0 services in `docker-compose.yml`.

Before starting, review secrets in `judge0.conf`.

```bash
docker compose up -d db redis
docker compose up -d
```

Note:

- Current backend execution client is configured for RapidAPI-style Judge0 host/key (`JUDGE0_HOST`, `JUDGE0_API_KEY`).
- If you switch to a direct local Judge0 API, backend integration code may need adjustment.

## Security Notes

- Never commit `.env` files.
- Rotate any key that was ever committed by mistake.
- Use a long random `AUTH_JWT_SECRET` in production.
- Keep `EXPOSE_RESET_LINK_IN_RESPONSE=false` in production.
- Restrict CORS and tighten execution flags in production:
  - `ALLOW_EXEC_ALL=false`
  - `ALLOW_DEP_INSTALL=false`

## Module Docs

- Client docs: `client/README.md`
- Server docs: `server/README.md`
