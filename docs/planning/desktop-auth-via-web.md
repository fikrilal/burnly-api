# Desktop authentication via Burnly Web

## Status

Design accepted. **burnly-api handoff endpoints implemented** (ADR 0022).  
Web + desktop integration still pending.

Date: 2026-07-10  
Audience: burnly-api, burnly-web, burnly desktop  
Related:

- Web login already ships Google → `POST /v1/auth/oidc/exchange` → httpOnly session cookies
- Collect APIs already require first-party Bearer tokens
- Standards: `docs/standards/authentication.md`
- ADRs: `docs/adr/0005-auth-oidc-primary-first-party-tokens.md`, `0010-refresh-tokens-opaque-rotation.md`

## Problem

Desktop utilities (WakaTime, etc.) typically **do not** own the login UI. Users sign in on the **website**, then return to the app.

Burnly product intent:

- **Google first** (web already does this)
- **GitHub later** (same handoff path; new OIDC provider)
- **Password endpoints are kit surface**, not the desktop product path
- Desktop collect (`/v1/sync/*`) needs first-party `accessToken` + `refreshToken`

Putting a Google button only inside the desktop app (or using email/password there) does not match product UX.

## Goal

Ship a **web-mediated desktop sign-in**:

1. Desktop opens Burnly Web login in the system browser.
2. User completes Google (later GitHub) on the web.
3. Browser redirects back to the desktop app.
4. Desktop obtains first-party tokens and uses them for API calls.

Password login may remain for web/admin/dev; **desktop product auth is OIDC via web only**.

## Non-goals (this design)

- Desktop-native password forms
- Embedding Google GIS solely inside Tauri without web
- Passing long-lived refresh tokens in deep-link query strings (unsafe)
- Replacing web cookie sessions (web keeps cookies; desktop uses tokens)

## Current building blocks (already true)

| Layer          | Today                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **burnly-api** | `POST /v1/auth/oidc/exchange` (GOOGLE), refresh, logout, JWKS; first-party access JWT + opaque refresh                                     |
| **burnly-web** | `/login` with Google GIS → server action `signInWithGoogleIdToken` → exchange → **sealed httpOnly cookie session** → redirect `/dashboard` |
| **Desktop**    | Not yet integrated; collect APIs expect Bearer tokens                                                                                      |

Gap: **no handoff from web session → desktop tokens via browser redirect.**

## Recommended flow (authorization-code handoff)

Modeled after native OAuth “auth code + PKCE”, simplified for first-party apps.

```text
Desktop                         Browser (burnly-web)              burnly-api
   |                                   |                              |
   | generate state + PKCE             |                              |
   | open login URL  ----------------->|                              |
   |                                   | Google GIS / later GitHub    |
   |                                   | id_token -------------------->|
   |                                   |   oidc/exchange              |
   |                                   | tokens + session cookie      |
   |                                   |                              |
   |                                   | create handoff code --------->|
   |                                   |   (Bearer access token)      |
   |                                   | code (TTL ~60s, one-time)    |
   |                                   |                              |
   | deep link callback <--------------| redirect burnly://...        |
   |   ?code=&state=                   |                              |
   |                                   |                              |
   | exchange code + verifier --------------------------------------->|
   |   POST /v1/auth/desktop/token                                    |
   | access + refresh <-----------------------------------------------|
   | store in OS keychain              |                              |
   | PUT /v1/sync/devices/...  -------------------------------------->|
   | POST /v1/sync/daily-usage -------------------------------------->|
```

### Why code + PKCE (not tokens in the URL)

- Deep-link query strings land in logs, shell history, crash reports, Referer.
- Refresh tokens must never appear in `burnly://…` URLs.
- Short-lived one-time **code** is the only safe redirect payload.
- PKCE binds the code to the desktop instance that started login.

## Client identity

| Client             | How it holds credentials                           |
| ------------------ | -------------------------------------------------- |
| **burnly-web**     | Sealed httpOnly cookie (access + refresh + userId) |
| **burnly-desktop** | OS keychain / secure store (access + refresh)      |
| **API**            | Authoritative sessions + refresh hashes            |

Same first-party token model for both clients after minting.

## URL contract (web login entry)

Desktop opens (example):

```text
https://burnly.dev/login
  ?client=desktop
  &redirect_uri=burnly%3A%2F%2Fauth%2Fcallback
  &state=<random>
  &code_challenge=<S256(challenge)>
  &code_challenge_method=S256
```

Parameters:

| Param                   | Required | Notes                               |
| ----------------------- | -------- | ----------------------------------- |
| `client`                | yes      | `desktop` (future: `cli` if needed) |
| `redirect_uri`          | yes      | Allowlisted only (see below)        |
| `state`                 | yes      | CSRF; desktop must verify on return |
| `code_challenge`        | yes      | PKCE S256                           |
| `code_challenge_method` | yes      | `S256` only                         |

### Allowlisted `redirect_uri` values (v1)

Exact match only (no wildcards):

- `burnly://auth/callback` (production custom scheme)
- `http://127.0.0.1:<port>/callback` optional loopback for dev (fixed port or small range, documented)

Reject anything else.

## API surface (to add)

### 1. Create handoff code (authenticated)

Called by **burnly-web** after a successful web login when `client=desktop`.

```http
POST /v1/auth/desktop/handoff
Authorization: Bearer <web accessToken>
Content-Type: application/json

{
  "redirectUri": "burnly://auth/callback",
  "codeChallenge": "<base64url>",
  "codeChallengeMethod": "S256",
  "state": "<opaque>",
  "client": "desktop"
}
```

Response:

```json
{
  "data": {
    "code": "<one-time>",
    "expiresIn": 60,
    "redirectUri": "burnly://auth/callback",
    "state": "<echo state>"
  }
}
```

Server stores (hashed code):

- `userId`, `sessionId` (or mint a **new** desktop session family on exchange — see decision below)
- `codeChallenge`, `redirectUri`, `client`
- `expiresAt`, `usedAt`

### 2. Exchange handoff code (public, desktop)

```http
POST /v1/auth/desktop/token
Content-Type: application/json

{
  "code": "<one-time>",
  "codeVerifier": "<pkce verifier>",
  "redirectUri": "burnly://auth/callback",
  "client": "desktop",
  "deviceId": "<stable install id>",
  "deviceName": "Fikri's laptop"
}
```

Response: same shape as login/OIDC exchange:

```json
{
  "data": {
    "user": { "...": "..." },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

Rules:

- Verify PKCE: `S256(codeVerifier) == codeChallenge`
- Verify `redirectUri` matches create-time value
- One-time use; concurrent exchange loses
- TTL ~60s
- Rate limit by IP + code prefix

### Session minting on exchange (decision)

**Preferred:** exchange creates a **new session** for the desktop device (own refresh chain), separate from the browser session.

- Revoking desktop logout does not kill the browser tab session
- Matches multi-device model already used for sessions

Alternative (rejected for v1): copy the same refresh family as the web cookie — couples browser and desktop lifecycles.

## Web behavior changes (burnly-web)

1. `/login` accepts desktop query params; preserve them through Google GIS callback.
2. After `exchangeOidc` + cookie establish:
   - If **not** desktop → `redirect /dashboard` (current).
   - If **desktop** → call `POST /v1/auth/desktop/handoff` with the new access token, then `redirect` to:

```text
{redirect_uri}?code={code}&state={state}
```

3. Error page if handoff fails (show message; offer retry).
4. Marketing/docs: “Sign in to Burnly Desktop” entry can deep-link to the same login URL builder.

GitHub later: same post-login handoff; only the IdP step on `/login` changes.

## Desktop behavior

1. Generate `state`, `code_verifier`, `code_challenge`.
2. Open system browser to web login URL.
3. Register custom protocol handler `burnly://` (and/or loopback server in dev).
4. On callback: validate `state`, call `POST /v1/auth/desktop/token`.
5. Store tokens in OS secure storage.
6. Refresh via existing `POST /v1/auth/refresh`; logout via `POST /v1/auth/logout`.
7. Collect path unchanged: Bearer on device + daily-usage.

## Provider roadmap

| Provider | Product          | API                                        | Web                             |
| -------- | ---------------- | ------------------------------------------ | ------------------------------- |
| Google   | v1               | `GOOGLE` on `oidc/exchange` (exists)       | GIS (exists)                    |
| GitHub   | later            | Add `GITHUB` (or generic OIDC) to exchange | GitHub OAuth button on `/login` |
| Password | web/dev optional | exists                                     | optional; **not** desktop entry |

Desktop never needs password endpoints.

## Security checklist

- [ ] No access/refresh in deep-link query or fragment for production
- [ ] Handoff code hashed at rest; single use; short TTL
- [ ] PKCE S256 required
- [ ] Strict `redirect_uri` allowlist
- [ ] `state` required and verified by desktop
- [x] Rate limits on handoff create + token exchange (API: IP + user on create)
- [ ] Desktop session distinct from browser session
- [ ] Device metadata on token exchange for session list UX
- [ ] Logging: never log code, verifier, or tokens

## Implementation sequence

### Phase 0 — Agree (this doc)

- Accept handoff + PKCE + allowlisted redirect
- Confirm custom scheme `burnly://auth/callback`

### Phase 1 — burnly-api

1. ADR: desktop web handoff (status Accepted)
2. Persistence for handoff codes (or Redis with TTL)
3. `POST /v1/auth/desktop/handoff` + `POST /v1/auth/desktop/token`
4. OpenAPI + Spectral + e2e
5. Error codes enum entries

### Phase 2 — burnly-web

1. Login query param contract + preserve across Google
2. Post-login handoff branch
3. Desktop success/error interstitial pages (optional but good UX)
4. Env: public origin, allowed redirect schemes already enforced by API

### Phase 3 — desktop

1. Protocol registration
2. Login button → open browser
3. Callback → token exchange → keychain
4. Wire collect APIs

## Alternatives considered

| Approach                                                   | Verdict                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Desktop embeds Google GIS and calls `oidc/exchange` itself | Works technically; **wrong product** for utility apps; duplicates login UX |
| Redirect with tokens in URL                                | **Rejected** (secret leakage)                                              |
| Web shows QR / paste code                                  | Possible later; worse UX than deep link                                    |
| Loopback-only (no custom scheme)                           | OK for dev; production prefers `burnly://` + optional loopback             |
| Desktop uses web cookies                                   | **Rejected** (different process; no shared cookie jar)                     |

## Success criteria

- User can install desktop, click “Sign in with Google”, finish on burnly-web, land back in app signed in
- No password form in desktop
- Same account works on web dashboard and desktop collect
- Logout on desktop does not force-logout all browsers (session isolation)
- GitHub can be added without changing the handoff shape

## Open decisions (defaults)

1. **Custom scheme:** `burnly://auth/callback` (default).
2. **Handoff TTL:** 60 seconds.
3. **New desktop session on exchange:** yes.
4. **GitHub:** same flow after provider support on API + web button.
5. **Password:** remain for kit/web optional; hide from desktop product.

## Links

- Web: `src/features/auth/actions/sign-in-with-google.ts`, `/login`
- API: `POST /v1/auth/oidc/exchange`, refresh rotation ADR 0010
- Collect: `docs/planning/desktop-collect-api-requirements.md`
