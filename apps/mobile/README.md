# Magnus Mobile — authenticated read-only summary

React Native (Expo) client for Magnus Nonprofit OS. The app talks to the **Next.js web app** (`EXPO_PUBLIC_API_BASE_URL`); the web app proxies organization data from **org-dashboard-api** — the mobile app does not call org-dashboard-api directly.

## Features

- Sign-in with **EIN + email + password** via `POST /api/auth/login?includeAccessToken=true` (JSON). The access token is stored in **expo-secure-store** and sent as `Authorization: Bearer` on API calls.
- **Read-only home dashboard** via `GET /api/mobile/org-readiness`: organization overview, compliance calendar summary, governance readiness, restricted funds (or unavailable if not enabled), audit prep summary, plus an explicit “not on mobile” card.
- Session profile from `GET /api/me` (Bearer or session cookie on web).
- Fail-closed on invalid or expired tokens (local token cleared).
- Logout calls `POST /api/auth/logout` and clears the local token.

## Setup

1. Install dependencies (from repo root):

   ```bash
   pnpm install
   ```

2. Create `.env` in `apps/mobile`:

   ```bash
   cp .env.example .env
   ```

3. Point the app at the web dev server:

   ```
   EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
   ```

4. For a full smoke test, run **web**, **org-dashboard-api**, and **Postgres** with `ORG_DASHBOARD_API_URL` set on the web app so the BFF can reach the org API (e.g. `http://localhost:4010`).

## Development

```bash
pnpm start
```

Platform targets:

```bash
pnpm ios
pnpm android
pnpm web
```

## Architecture

```
apps/mobile/
├── src/
│   ├── components/     # e.g. TabBar
│   ├── contexts/       # AuthContext
│   ├── navigation/
│   ├── screens/        # Login, Home, Settings
│   └── services/       # api.ts, storage.ts
├── App.tsx
└── package.json
```

### Auth flow

1. **Launch** — AuthProvider loads stored token; if present, validates with `GET /api/me`.
2. **Login** — `POST /api/auth/login?includeAccessToken=true` with JSON body `{ ein, email, password }`; save `accessToken` from the response; then `GET /api/me`.
3. **Home** — `GET /api/mobile/org-readiness` with `Authorization: Bearer <accessToken>`.

### Security

- Tokens live in **expo-secure-store** (Keychain / Keystore).
- **No direct DB access**; all data goes through the web API.
- The JSON login query flag `includeAccessToken=true` is intended for **native clients**; web clients can keep using cookies only.

## Verification

- Typecheck:

  ```bash
  pnpm --filter @magnus/mobile typecheck
  ```

- Mapper unit tests (web lib, Vitest from repo root):

  ```bash
  pnpm vitest tests/integration/mobileOrgReadinessDto.test.ts
  ```

- **Manual smoke:** Expo + web + org-dashboard-api with a real org; sign in with the EIN flow; Home should show sections or truthful “unavailable” states (e.g. restricted funds if the tier does not allow it).

There is no Detox/E2E suite in this repo for mobile.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | Yes | `http://localhost:3000` | Next.js web app base URL (BFF) |

## Limitations (v1)

- Read-only summaries only; no editing, uploads, or full web dashboards.
- No OAuth; password + org EIN flow only.
- Logout clears the client; server-side refresh revocation depends on refresh cookies (primarily a web concern).

## License

UNLICENSED — Private
