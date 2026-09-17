# Build Roadmap

Phased so each phase is reviewable and usable on its own before the next
begins.

- [ ] **Phase 1 — Core internal system**
  Auth for internal roles (Company Owner, Project Coordinator, Sales
  Manager, Import Manager, Installation & Service Engineer), orders +
  requirements + the 12-stage pipeline (entered/updated by the Project
  Coordinator), document upload, Company Owner portfolio dashboard.
- [ ] **Phase 2 — External project logins**
  One supplier login + one customer login per project — observer + comment
  only, scoped via `scope_order_id`.
- [ ] **Phase 3 — Shipment & customs detail + notifications**
  Shipment tracking fields, email alerts on milestone due/overdue, comment
  notifications to relevant roles.
- [ ] **Phase 4 — Post-handover service module**
  Service tickets, AMC schedules, customer ticket-raising via their project
  login, Company Owner visibility into open/overdue tickets.
- [ ] **Phase 5 — AI integration layer**
  Claude/Gemini/ChatGPT-backed reports, risk advisory, follow-up drafting,
  monitoring digest.
- [ ] **Phase 6 — Bluehost deployment**
  cPanel MySQL DB, PHP deployment, static frontend build, SSL, cron jobs,
  go-live.

## Open item to revisit

External logins are scoped to one project each (a repeat customer/supplier
gets a fresh login per order). If this becomes inconvenient in practice
(same customer, many projects, many passwords to remember), the fix is to
add a `companies` table back and link multiple orders to one external
account — flagged here so it's not forgotten, not built until asked for.

## Current status

Phase 0 (system design) — complete, refined based on BLI's actual team
structure. See `docs/ARCHITECTURE.md`.
Not yet started: Phase 1.
