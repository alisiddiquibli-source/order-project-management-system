# Order & Project Lifecycle Management System (Business Links International)

Tracks equipment/project orders from requirement capture through handover
and ongoing post-handover service: ordering → machine manufacturing progress
at supplier site → machine testing material coordination → machine FAT
readiness → shipment coordination → import clearance in Pakistan → delivery
→ installation → SAT → training → handover → service/AMC. BLI does not
track the supplier's own raw-material import — scope starts at manufacturing.
Pakistan customs clearance and final delivery (stages 7–8) are executed by
the **customer's own import team**, not BLI — BLI only coordinates.

Internal roles: Company Owner (portfolio view), Project Coordinator (single
point of data entry, owns every order assigned to them), Sales Manager
(customer relationship, read + comment), Import Manager (global advisor,
comment only, no edit rights — joins the Project Coordinator on stages 6–8
only when the customer's import team asks for help), Installation & Service
Engineer (owns installation/SAT/training/handover + post-handover service
for their assigned orders). BLI has multiple people per role (several PCs,
several Sales Managers, etc.) — **one login per person**, and each login's
access is every order that person is assigned to (`project_coordinator_id`
/ `sales_manager_id` / `installation_engineer_id`), not role-wide (except
Company Owner and Import Manager, who are role-wide by design).

External: **one customer login per project** (`scope_order_id`), but **one
supplier login per supplier company covering every project that company
supplies** (`supplier_id`, via the `suppliers` table) — observer + comment
only, no data entry, for both.

Full design: `docs/ARCHITECTURE.md`. Build order and current phase:
`docs/ROADMAP.md` — check this before starting new work.

## Stack

- Backend: PHP 8 + PDO/MySQL, REST API (JSON)
- Frontend: SPA (Vue/React), static build, calls the REST API
- Auth: JWT (short-lived access + refresh)
- Hosting target: Bluehost shared/cPanel hosting

## Non-negotiable rules

- Every request touching an order/stage/document/comment is authorized
  server-side against the requesting user's actual scope — their assigned
  order(s) for internal roles, `scope_order_id` for a customer, `supplier_id`
  for a supplier — never trust a client-supplied order ID alone. External
  logins are the top cross-tenant leakage risk in this system.
- `documents.visibility` (`internal|supplier|customer|shared`) is enforced on
  every read path, not just in the UI.
- Project Coordinator is the only role that writes `order_stages` status by
  default — don't add write access for other internal roles without
  confirming with the user first, it's a deliberate single-point-of-entry
  design.
- Target/planned dates per stage are entered manually per order by the PC —
  no lead-time template auto-fills them (rejected on purpose: lead times
  vary too much by machine type).
- A FAT/SAT stage (`fat_sat_records`) cannot be marked `completed` while it
  has open `punch_list_items` with result `fail` or `conditional_pass` —
  enforce this server-side, not just in the UI.
- The daily deadline-check job is the source of truth for `delayed` status
  and at-risk notifications (see `docs/ARCHITECTURE.md` §3.4) — don't
  hand-roll a second overdue check elsewhere.
- AI provider keys (Claude/Gemini/ChatGPT) live server-side only, never sent
  to the frontend.
- Uploaded documents are served through an authenticated endpoint, never as
  direct static links.

## Conventions

- Commit messages: imperative, one line, no AI attribution beyond what the
  harness appends automatically.
- Keep `docs/ROADMAP.md` checkboxes current as phases complete.
