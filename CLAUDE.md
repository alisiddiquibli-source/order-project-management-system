# Order & Project Lifecycle Management System (Business Links International)

**A Project is one customer deal; an Order is one machine.** A project can
hold multiple orders, each running its own 12-stage pipeline independently:
requirements → order placed → machine manufacturing progress → machine
testing material coordination → machine FAT readiness → shipment
coordination → import clearance in Pakistan → delivery → installation →
SAT → training → handover → post-handover service/AMC. BLI does not track
the supplier's own raw-material import — scope starts at manufacturing.
Pakistan customs clearance and final delivery (stages 7–8) are executed by
the **customer's own import team**, not BLI — BLI only coordinates.

Internal roles, in accountability order:

1. **Company Owner** — full visibility across every project/order: who's
   assigned as Sales Manager and PC on each, how each is tracking, plus
   every deadline/blocker alert and AI advisory at portfolio scope (not
   just a digest). Also holds account administration (create/deactivate
   logins, assign roles). No project data entry.
2. **Sales Manager** — primary accountable custodian, assigned per
   **project** (`projects.sales_manager_id`), covering every order in it.
   Full read visibility, directs the PC, holds acceptance authority
   alongside the customer (§3.4 of ARCHITECTURE.md). Doesn't enter data
   directly.
3. **Project Coordinator** — the operational executor and sole data-entry
   point for `order_stages` status. Assigned per project by default
   (`projects.project_coordinator_id`), overridable per order. Accountable
   to that project's Sales Manager.
4. **Import Manager** — global advisor, comment only, no edit rights; joins
   the PC and Sales Manager on stages 6–8 only when the customer's import
   team asks for help.
5. **Installation & Service Engineer** — assigned per **order**
   (`orders.installation_engineer_id`, can differ machine-to-machine even
   within one project). Has direct write access to the stage 9–11 evidence
   tables (installation report, `fat_sat_records`/SAT, `training_records`)
   — but the PC still flips `order_stages.status` to `completed` from that
   evidence. Manages post-handover service tickets/AMC directly, no PC
   hand-off. Accountable to that order's Sales Manager.

BLI has multiple people per role (several PCs, several Sales Managers,
etc.) — **one login per person**, access is every project/order that
person is assigned to, not role-wide (except Company Owner and Import
Manager, who are role-wide by design).

External: **one customer login per project** (`scope_project_id` — sees
every machine/order in that project), **one supplier login per supplier
company** covering every order that company supplies (`supplier_id`) —
observer + comment only, no data entry, for both. Comments are channel-
scoped (`internal`/`customer`/`supplier`) — a customer never sees the
supplier channel or vice versa.

Full design: `docs/ARCHITECTURE.md`. Build order and current phase:
`docs/ROADMAP.md` — check this before starting new work.

## Stack

- Backend: PHP 8 + PDO/MySQL, REST API (JSON)
- Frontend: SPA (Vue/React), static build, calls the REST API
- Auth: JWT (short-lived access + refresh)
- Hosting target: Bluehost shared/cPanel hosting

## Non-negotiable rules

- Every request is authorized server-side against the requester's actual
  scope — Sales Manager via `project.sales_manager_id`, PC via
  `order.project_coordinator_id` (falling back to the project's default),
  Engineer via `order.installation_engineer_id`, customer via
  `scope_project_id`, supplier via `supplier_id` — never trust a
  client-supplied id alone. External logins are the top cross-tenant
  leakage risk in this system.
- `documents.visibility` and `comments.channel` are enforced on every read
  path, not just in the UI — internal content never reaches an external
  login by accident.
- Project Coordinator is the only role that writes `order_stages.status` —
  the Installation & Service Engineer writes stage 9–11 *evidence* tables
  directly, but not the stage status itself. Don't add status write access
  for other roles without confirming with the user first.
- Target/planned dates per stage are entered manually by the PC — no
  lead-time template auto-fills them. Any change to a `planned_end` or
  `target_handover_date` must write a `commitment_changes` row (reason,
  who, whether the customer was told) — never a silent UPDATE.
- A `conditional_pass` FAT/SAT result is usable only once it has an
  `acceptances` record from the Sales Manager or the customer (whichever
  is first) — closing every punch-list item is NOT itself acceptance. A
  `critical`-severity open punch item forces `fail`, never
  `conditional_pass`.
- `acceptances` and `commitment_changes` are append-only — never edited or
  deleted, only superseded.
- A `blocked` stage requires `blockers.description` /
  `responsible_party` / `next_action` / `next_review_date` — these are
  required, not optional. Blocked stages are monitored harder than normal
  ones, never excluded from the deadline cron. Escalate to Sales Manager +
  Company Owner after 7 days blocked without resolution.
- The daily deadline-check job is the source of truth for `delayed` status
  and at-risk notifications (`docs/ARCHITECTURE.md` §4.4–4.5) — don't
  hand-roll a second overdue check elsewhere.
- AI risk-advisory output is surfaced to the Sales Manager, PC, and Company
  Owner jointly per order; portfolio-pattern advisory is Owner-only. Every
  AI output is logged in `ai_reports` with a status
  (`new/acknowledged/dismissed/actioned`) — it's advisory, the system never
  auto-executes a recommendation. Portfolio advisory judges by delay cause/
  responsibility (via `blockers.responsible_party`), not raw overdue counts.
- No payment/value tracking is in scope — `contract_value`/`currency` are
  static reference fields only, not monitored or reported on.
- AI provider keys (Claude/Gemini/ChatGPT) live server-side only, never
  sent to the frontend.
- Uploaded documents are served through an authenticated endpoint, never
  as direct static links.

## Conventions

- Commit messages: imperative, one line, no AI attribution beyond what the
  harness appends automatically.
- Keep `docs/ROADMAP.md` checkboxes current as phases complete.
