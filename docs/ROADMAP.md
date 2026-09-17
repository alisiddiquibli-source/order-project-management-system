# Build Roadmap

Phased so each phase is reviewable and usable on its own before the next
begins.

- [ ] **Phase 1 — Core internal system**
  Auth (internal roles only), orders + requirements + the 13-stage pipeline
  (tracked manually by the internal team), document upload, basic dashboard.
- [ ] **Phase 2 — Supplier portal**
  External supplier logins, scoped to stages 3–6 (import, processing/
  manufacturing, testing material, FAT).
- [ ] **Phase 3 — Customer portal**
  Read-only progress view, shared documents, SAT sign-off.
- [ ] **Phase 4 — Shipment & customs module + notifications**
  Shipment tracking, email alerts on milestone due/overdue.
- [ ] **Phase 5 — AI integration layer**
  Claude/Gemini/ChatGPT-backed reports, risk advisory, follow-up drafting,
  monitoring digest.
- [ ] **Phase 6 — Bluehost deployment**
  cPanel MySQL DB, PHP deployment, static frontend build, SSL, cron jobs,
  go-live.

## Current status

Phase 0 (system design) — complete. See `docs/ARCHITECTURE.md`.
Not yet started: Phase 1.
