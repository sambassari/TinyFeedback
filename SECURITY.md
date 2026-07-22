# Security

Please report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/sambassari/TinyFeedback/security/advisories/new).

Include a short description, steps to reproduce, and impact if you know it.

## Auth model

TinyFeedback uses a single admin password (scrypt hash in `data/admin.json`), a signed `httpOnly` session cookie, and optional API tokens (SHA-256 hashes in `data/tokens.json`).

| Surface | Access |
| --- | --- |
| Widget `POST /api/feedback` | Public for allowed domains, with rate limit + honeypot |
| Dashboard, password change, token management | Session cookie required |
| List / delete / export feedback | Session cookie **or** `Authorization: Bearer` API token |

Set strong values before exposing the server:

```bash
cp .env.example .env
# edit ADMIN_PASSWORD and SESSION_SECRET
```

- `ADMIN_PASSWORD` — used only to bootstrap `data/admin.json` on first run; change later in Settings
- `SESSION_SECRET` — at least 16 characters; used to sign cookies

On localhost, missing env vars fall back to password `admin` for quick demos. Binding to a public host without env vars will refuse to start.

Raw API tokens (`tf_live_…`) are shown once at creation. Treat them like passwords; revoke unused tokens from the dashboard.

Allowed widget origins live in `data/domains.json`. Turn off auto-add and keep an explicit list if you want a strict allowlist.

## Spam protection

Public `POST /api/feedback` is protected by:

1. **Per-IP rate limiting** — defaults to 30 requests / 15 minutes (`FEEDBACK_RATE_MAX`, `FEEDBACK_RATE_WINDOW_MS`)
2. **Honeypot field** (`_hp`) — filled bots get a fake success and nothing is stored
3. **Domain allowlist** — optional; auto-add is on by default for easier setup

Login attempts are rate-limited separately.

## Deploy notes

- Prefer HTTPS so the session cookie is marked `Secure` (set when the request is TLS or `X-Forwarded-Proto: https`)
- Keep the Node process on `127.0.0.1` and terminate TLS on Caddy/Nginx (see `deploy/`)
- In Docker, bind `0.0.0.0` inside the container only; do not expose the raw port publicly without a proxy if you can avoid it
- Trust `X-Forwarded-For` only from your own reverse proxy
