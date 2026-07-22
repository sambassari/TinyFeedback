# Changelog

All notable changes to TinyFeedback are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [SemVer](https://semver.org/).

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

[1.1.0]: https://github.com/sambassari/TinyFeedback/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/sambassari/TinyFeedback/releases/tag/v1.0.0
