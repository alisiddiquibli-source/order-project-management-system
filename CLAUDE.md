# Order & Project Lifecycle Management System (Business Links International)

Tracks equipment/project orders from requirement capture through handover
and ongoing post-handover service: ordering → machine manufacturing progress
at supplier site → machine testing material coordination → machine FAT
readiness → shipment coordination → import clearance in Pakistan → delivery
→ installation → SAT → training → handover → service/AMC. BLI does not
track the supplier's own raw-material import — scope starts at manufacturing.

Internal roles: Company Owner (portfolio view), Project Coordinator (single
point of data entry, owns every order assigned to them), Sales Manager
(customer relationship, read + comment), Import Manager (global advisor on
import/customs, comment only, no edit rights), Installation & Service
Engineer (owns installation/SAT/training/handover + post-handover service
for their assigned orders).

External: one supplier login + one customer login **per project** (not per
company) — observer + comment only, scoped by `scope_order_id`.

Full design: `docs/ARCHITECTURE.md`. Build order and current phase:
`docs/ROADMAP.md` — check this before starting new work.

## Stack

- Backend: PHP 8 + PDO/MySQL, REST API (JSON)
- Frontend: SPA (Vue/React), static build, calls the REST API
- Auth: JWT (short-lived access + refresh)
- Hosting target: Bluehost shared/cPanel hosting

## Non-negotiable rules

- Every request touching an order/stage/document/comment is authorized
  against the requesting user's assigned order(s) or `scope_order_id`
  server-side — never trust a client-supplied order ID alone. External
  logins are the top cross-tenant leakage risk in this system.
- `documents.visibility` (`internal|supplier|customer|shared`) is enforced on
  every read path, not just in the UI.
- Project Coordinator is the only role that writes `order_stages` status by
  default — don't add write access for other internal roles without
  confirming with the user first, it's a deliberate single-point-of-entry
  design.
- AI provider keys (Claude/Gemini/ChatGPT) live server-side only, never sent
  to the frontend.
- Uploaded documents are served through an authenticated endpoint, never as
  direct static links.

## Conventions

- Commit messages: imperative, one line, no AI attribution beyond what the
  harness appends automatically.
- Keep `docs/ROADMAP.md` checkboxes current as phases complete.
