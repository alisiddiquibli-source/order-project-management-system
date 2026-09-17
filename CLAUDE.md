# Order & Project Lifecycle Management System

Tracks equipment/project orders from requirement capture through handover:
ordering → import & manufacturing at supplier site → testing material
supply → FAT → shipment coordination → import clearance in Pakistan →
delivery → installation → SAT → training → handover.

Three audiences: internal team (full access), suppliers (external login,
scoped to their assigned stages), customers (external login, scoped to their
own order, read-only + SAT sign-off).

Full design: `docs/ARCHITECTURE.md`. Build order and current phase:
`docs/ROADMAP.md` — check this before starting new work.

## Stack

- Backend: PHP 8 + PDO/MySQL, REST API (JSON)
- Frontend: SPA (Vue/React), static build, calls the REST API
- Auth: JWT (short-lived access + refresh)
- Hosting target: Bluehost shared/cPanel hosting

## Non-negotiable rules

- Every request touching an order/stage/document is authorized against the
  requesting user's `company_id` server-side — never trust a client-supplied
  order ID alone. Suppliers and customers are external parties; cross-tenant
  leakage is the top risk in this system.
- `documents.visibility` (`internal|supplier|customer|shared`) is enforced on
  every read path, not just in the UI.
- AI provider keys (Claude/Gemini/ChatGPT) live server-side only, never sent
  to the frontend.
- Uploaded documents are served through an authenticated endpoint, never as
  direct static links.

## Conventions

- Commit messages: imperative, one line, no AI attribution beyond what the
  harness appends automatically.
- Keep `docs/ROADMAP.md` checkboxes current as phases complete.
