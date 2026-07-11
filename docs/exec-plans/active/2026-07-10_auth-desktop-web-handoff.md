# Auth — Desktop web handoff (backend)

## Outcome

burnly-api can create and exchange desktop handoff codes so burnly-web can complete Google login and bounce the user back to desktop with a safe one-time code.

## Scope (API only)

- [x] ADR 0022
- [x] Error codes + env config
- [x] Domain: PKCE S256, redirect allowlist
- [x] Port + Redis store
- [x] App service create/exchange
- [x] HTTP: `POST /v1/auth/desktop/handoff`, `POST /v1/auth/desktop/token`
- [x] Unit tests
- [x] OpenAPI snapshot

## Out of scope

- burnly-web login query params / redirect UI
- Desktop deep-link handler
- GitHub OIDC provider (handoff shape is provider-agnostic)

## Parent

`docs/planning/desktop-auth-via-web.md`
