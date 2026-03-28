# Server (Express + MongoDB)

Backend API for JIT CC Full.

Responsibilities:

- Auth and RBAC for student/admin users.
- Judge0 execution proxy integration (RapidAPI host/key model).
- Submission, event, leaderboard, and selection flows.
- Rewards and certificate APIs.
- Admin workflows for events, problems, attendance, and audits.
- Forgot-password reset flow with optional SMTP delivery.

## Requirements

- Node.js 18+
- npm 9+
- MongoDB instance
- RapidAPI Judge0 host/key
- Gemini API key

## Installation

```bash
npm install
```

## Environment Setup

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

### Required Keys

- `PORT`
- `AUTH_JWT_SECRET`
- `MONGO_URI`
- `JUDGE0_HOST`
- `JUDGE0_API_KEY`
- `GEMINI_API_KEY`

### Optional Keys

- `GEMINI_MODEL`
- `CLIENT_BASE_URL`
- `FRONTEND_URL`
- `APP_BASE_URL`
- `SMTP_ENABLED`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `EXPOSE_RESET_LINK_IN_RESPONSE`
- `EVENT_SELECTION_UNLOCK_GRACE_MINUTES`
- `ALLOW_EXEC_ALL`
- `ALLOW_DEP_INSTALL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

## Run Commands

- `npm run dev`: run server with Node watch mode.
- `npm start`: run with nodemon.

Default API URL:

- `http://127.0.0.1:9009`

## Seed Commands

- `npm run seed:admin`
- `npm run seed:demo-certificate`
- `npm run seed:jit-hackathon`

## API Overview

### Core

- `GET /api/health`
- `POST /api/execute`
- `POST /api/ai-suggestions`

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/role-requests`
- `GET /api/auth/me`
- `GET /api/auth/admin/check`

### Problems and Submissions

- `GET /api/problems`
- `GET /api/problems/:problemId`
- `POST /api/submissions`
- `GET /api/submissions/user/:userId`
- `GET /api/submissions/problem/:problemId`
- `GET /api/submissions/:submissionId`
- `POST /api/submissions/:submissionId/reevaluate`

### Events and Leaderboards

- `POST /api/events/join`
- `GET /api/events/my`
- `GET /api/events/:eventId/problems/my-selection`
- `POST /api/events/:eventId/problems/my-selection`
- `DELETE /api/events/:eventId/problems/my-selection`
- `GET /api/events/:eventId/leaderboard`
- `GET /api/leaderboard`
- `POST /api/leaderboard`

### Certificates and Rewards

- `GET /api/certificates/my`
- `GET /api/certificates/verify/:verificationCode`
- `GET /api/certificates/assets`
- `GET /api/rewards/my-prizes`
- `POST /api/rewards/allocations/:allocationId/claim`

### Admin

- `GET /api/admin/overview`
- `GET /api/admin/events`
- `POST /api/admin/events`
- `PUT /api/admin/events/:eventId`
- `DELETE /api/admin/events/:eventId`
- `GET /api/admin/students`
- `PUT /api/admin/students/:userId/freeze`
- `POST /api/admin/students/:userId/force-password-reset`
- `POST /api/admin/problems`
- `PUT /api/admin/problems/:problemId`
- `DELETE /api/admin/problems/:problemId`
- `POST /api/admin/problems/bulk/import`
- `GET /api/admin/events/:eventId/results`
- `POST /api/admin/events/:eventId/results/compute`
- `POST /api/admin/events/:eventId/results/finalize`

## Forgot Password Behavior

- If SMTP is configured and enabled, reset links are sent by email.
- If SMTP is unavailable, response includes a reset URL for dev/test workflow.
- Keep `EXPOSE_RESET_LINK_IN_RESPONSE=false` in production.

## Security and Ops Notes

- Do not commit `.env`.
- Use a strong random value for `AUTH_JWT_SECRET`.
- Restrict CORS and origin policy before production deployment.
- Keep dangerous flags disabled in production:
  - `ALLOW_EXEC_ALL=false`
  - `ALLOW_DEP_INSTALL=false`

## Project Layout

- `config/`: database and server configuration helpers.
- `controllers/`: business logic per domain.
- `middleware/`: auth and role guards.
- `models/`: Mongoose schemas.
- `routes/`: API route modules.
- `scripts/`: data/seed and utility scripts.
- `data/`: local JSON data used by selected flows.
