# Mini Project 
# Server (Express proxy to Judge0 via RapidAPI)

## Setup

1. `cp .env.example .env` and fill `JUDGE0_HOST`, `JUDGE0_API_KEY`, `GEMINI_API_KEY`, and `AUTH_JWT_SECRET`.
2. `npm i`
3. `npm run dev` (or `npm start`)

## Endpoints

### POST `/api/execute`

Body: `{ "language_id": 63, "source_code": "print('hi')", "stdin": "" }`
Returns Judge0 result with decoded stdout/stderr/compile_output and `timeMs`.

### POST `/api/ai-suggestions`

Body: `{ "code": "function foo(){}" }`
Returns Gemini model suggestions for the supplied prompt.

### POST `/api/auth/login`

Body: `{ "email": "demo@example.com", "password": "password123" }`
Returns `{ token, user }` where `token` is a JWT valid for 7 days.

> Demo credentials live in `data/users.json` (`demo@example.com` / `password123`). Update that file with hashed passwords (`bcryptjs`) to add more accounts.
