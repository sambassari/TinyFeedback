# Contributing

Thanks for helping with TinyFeedback.

## Setup

```bash
git clone git@github.com:sambassari/TinyFeedback.git
cd TinyFeedback
cp .env.example .env
npm install
npm run dev
```

Local default password is `admin` if env vars are unset. Use `.env` for real credentials.

## Guidelines

- Keep the stack minimal: vanilla HTML/JS, Tailwind for styles, zero runtime deps on the server.
- Match the existing tone and UI — clean, quiet, Vercel-simple.
- Prefer small pull requests with a clear purpose.
- Run `npm run build:css` after changing `src/styles.css`.
- Don’t commit `data/feedback.json` or secrets.

## Pull requests

1. Fork and create a branch.
2. Make your change.
3. Open a PR describing what and why.

## Reporting bugs

Include steps to reproduce, expected vs actual behavior, and your Node.js version when you can.
