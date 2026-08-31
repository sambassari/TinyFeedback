# Changelog

All notable changes to TinyFeedback are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [SemVer](https://semver.org/).

## [1.2.1] — 2026-08-31

### Fixed
- Docker image now copies `package.json` into the runtime stage so `/api/health` and `/api/config` report the real SemVer instead of `0.0.0`

### Added
- `npm test` using Node's built-in `node:test` runner (zero extra dependencies)
- GitHub Actions CI on pull requests and pushes to `main`

## [1.2.0] — 2026-07-22

### Added
- NPS score type (0–10 recommend scale) in the widget
- Optional name + email on every submission
- Dashboard research snapshot: NPS, promoters/passives/detractors, top pages
- CSV columns for `score`, `name`, and `email`

## [1.1.0] — 2026-07-22

### Added
- Docker and docker-compose packaging
- Bare-metal deploy examples (Caddy, Nginx, systemd)
- Dashboard tabs: Feedback, API, Settings
- Admin password change, API tokens, public URL, allowed domains
- Spam protection (per-IP rate limit + honeypot)
- README screenshots
- Version exposed via `/api/health`, `/api/config`, and the dashboard

## [1.0.0] — 2026-07-22

### Added
- Initial self-hosted widget, JSON API, and dashboard

[1.2.1]: https://github.com/sambassari/TinyFeedback/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/sambassari/TinyFeedback/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/sambassari/TinyFeedback/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/sambassari/TinyFeedback/releases/tag/v1.0.0
