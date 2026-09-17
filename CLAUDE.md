# Order & Project Lifecycle Management System (Business Links International)

**A Project is one customer deal; an Order is exactly one physical
machine** (never a `quantity` field standing in for several — each machine
gets its own FAT/SAT/installation/acceptance). A project can hold multiple
orders, each running its own 12-stage pipeline independently: requirements
→ order placed → machine manufacturing progress → machine testing material
coordination → machine FAT readiness → shipment coordination → import
clearance in Pakistan → delivery → installation → SAT → training →
handover → post-handover service/AMC. BLI does not track the supplier's
raw-material import — scope starts at manufacturing. Pakistan customs
clearance and delivery (stages 7–8) are executed by the **customer's own
import team**, not BLI — BLI only coordinates.

Internal roles, in accountability order:

1. **Company Owner** — full visibility across every project/order, account
   administration, and the configurable system thresholds (SLA windows,
   escalation days). No project data entry.
2. **Sales Manager** — accountable custodian, assigned per **project**.
   Full read visibility, directs the PC, holds acceptance authority
   (see the SAT/handover rule below), approves `stage_exceptions`,
   order hold/cancel, and customer-facing date changes.
3. **Project Coordinator** — sole writer of `order_stages.status`. Records
   stage completion from the Engineer's evidence for stages 9–12. Assigned
   per project by default, overridable per order.
4. **Import Manager** — global advisor, comment only, no edit rights; joins
   the PC/Sales Manager on stages 6–8 only when the customer's import team
   asks.
5. **Installation & Service Engineer** — assigned per **order**. Writes the
   stage 9–12 *evidence* tables directly (`engineer_reports` for
   installation and handover-readiness, `fat_sat_records` for SAT,
   `training_records`) — never `order_stages.status` itself. Manages
   post-handover service tickets/AMC directly, no PC hand-off.

External: **one customer login per project** (`scope_project_id`, sees
every order in it), **one supplier login per supplier company** spanning
all their orders (`supplier_id`) — comment-only (channel-scoped:
`internal`/`customer`/`supplier`, never crossed), plus acceptance authority
for the customer specifically. Neither edits pipeline data, but both can
comment, raise tickets, and record authorized acceptances — that's real
data entry, just not pipeline data.

Full design: `docs/ARCHITECTURE.md`. Build order and current phase:
`docs/ROADMAP.md` — check this before starting new work.

## Working style (standing instruction)

**Design and build everything as a senior software developer would, and
hold that standard across every effort in this repo, not just the first
one.** Concretely, what that means here:

- Validate before claiming something works — a schema is proven by loading
  it into a real database and inserting real rows through it, not by
  reading it back and asserting it looks right. A backend skeleton is
  proven by actually hitting the endpoint. (This is precedent, not
  aspiration — that's exactly how the schema and backend skeleton were
  verified in this repo.)
- Flag trade-offs and risks plainly, in the docs, at the point they're
  introduced — e.g., §4.3.1's Google Drive access-control trade-off — never
  gloss over a weaker guarantee to make a feature sound simpler than it is.
- Clean, idiomatic code with meaningful names, no dead scaffolding left
  behind "just in case," no premature abstraction for a hypothetical future
  requirement.
- Small, well-described commits — one coherent change per commit, not a
  grab-bag.
- When a request implies a design decision (not just a code change), make
  the decision explicitly and record it in `docs/ARCHITECTURE.md`/this
  file, the same way every prior round of this project's design has been
  recorded — don't let a decision live only in a chat message.

## UX principle (standing requirement — see ARCHITECTURE.md §11.1)

Seven very different audiences use this system. **Every screen must be
friendly, attractive, and designed around how that specific role actually
works** — not one generic admin-panel skin reused everywhere. Owner gets
portfolio risk first, Sales Manager gets their projects' status, PC gets
today's actions, Engineer gets on-site forms usable on a phone/tablet,
Customer/Supplier get a zero-onboarding self-explanatory view. Build this
in from the first screen of Phase 1 — don't ship a bare table/CRUD UI and
plan to "prettify later."

## Stack

- Backend: PHP 8 + PDO/MySQL, REST API (JSON)
- Frontend: SPA (Vue/React), static build, calls the REST API
- Auth: JWT (short-lived access + refresh)
- Hosting target: Bluehost shared/cPanel hosting
- Two crons, not one: `check_stage_deadlines.php` (daily) and
  `check_ticket_sla.php` (**hourly** — an hour-level SLA can't be caught
  by a once-a-day scan)
- FAT/SAT photos and video: Google Drive (service account, not a personal
  OAuth token) — see the media rule below. PDFs stay on local storage.

## Non-negotiable rules

- Every request is authorized server-side against the requester's actual
  scope (project/order assignment, `scope_project_id`, or `supplier_id`)
  — never a client-supplied id alone.
- Every internal-role login must use a `@businesslinks-pk.com` email —
  enforced as a DB `CHECK` constraint on `users`, not only app-level
  validation. Supplier/customer logins are exempt (their own company's
  email).
- `documents.visibility`/`shared_with_supplier_id` and `comments.channel`/
  `shared_with_supplier_id` are enforced on every read — a project with
  machines from multiple suppliers must never let one supplier see another
  supplier's project-level shared item.
- PC is the only writer of `order_stages.status`. The Engineer writes
  stage 9–12 evidence tables directly but never the status field itself.
- **SAT and Handover require genuine customer acceptance to complete** —
  `acceptances.constitutes_customer_acceptance` must be true. A customer's
  own login satisfies this directly; a Sales Manager can only satisfy it
  by attaching `customer_authorization_evidence_document_id` (proof the
  customer actually agreed). A bare Sales Manager say-so records the
  decision but does NOT complete the stage, and notifies the Company
  Owner (this is BLI proceeding at its own risk, a liability call). FAT
  conditional-pass doesn't need this extra evidence — it's a pre-shipment
  internal risk call, either Sales Manager or customer suffices.
- An `acceptances` record is tied to a specific `target_record_id` (the
  exact FAT/SAT/training/report revision). If that record is later
  superseded by a retest, the old acceptance no longer satisfies
  completion — a fresh one is required against the new record.
- A `critical`-severity open punch item forces `fail`, never
  `conditional_pass`. A `stage_exceptions` row can never override a `fail`
  or an open critical item — only open minor items or a procedural delay,
  and only a Sales Manager/Owner can approve one.
- Completion means actually finished, not just reported:
  `engineer_reports.completion_status` requires an explicit
  complete/incomplete call with `outstanding_issues`, not just photos.
  `manufacturing_milestones` can't be empty before stage 3 starts.
- Target/planned dates: PC can freely log internal-only replanning:
  any change to `target_handover_date`, or to a date already communicated
  to the customer, requires `approved_by` = Sales Manager or Owner —
  written to `commitment_changes`, never a silent UPDATE.
- Blocked stages stay in the ordinary deadline scan (delay keeps accruing)
  AND get a `blockers` row with required `description`/`responsible_party`/
  `next_action`/`next_review_date`. Escalate to Sales Manager + Owner after
  7 days blocked or a missed `next_review_date`.
- `responsible_party` on `blockers` is a constrained enum
  (`bli_internal|supplier|customer|third_party`) — AI portfolio advisory
  attributes delay by this field, never by who typed the entry.
- Stage 6 (shipment) completion requires `shipments.actual_dispatch_date`
  — a freight booking alone is `in_progress`, not `completed`.
- `acceptances`, `commitment_changes`, `assignment_history`, and
  `customer_import_tracking_updates` are append-only — never edited or
  deleted, only superseded.
- Service tickets: `resolved` (Engineer fixed it) ≠ `closed`
  (`customer_confirmed` or `auto_closed_no_response` after 5 business days
  of silence — never presented as if the customer agreed). SLA clocks run
  in business hours, checked hourly.
- No payment/value tracking — `contract_value`/`currency` are static
  reference fields only.
- AI provider keys live server-side only. The scope filter for an AI
  prompt is enforced inside the data-gathering function, not left to the
  caller.
- Uploaded documents are served through an authenticated endpoint, never
  as direct static links.
- FAT/SAT photos/video live in Google Drive (`documents.storage_type =
  google_drive`, `file_path` = Drive file ID), tied to the specific
  `fat_sat_record_id` they document, not just the stage. The backend never
  returns the Drive link to a request that hasn't already passed the
  normal `visibility`/`channel` scope check — same authorization gate as
  any other document, even though the file itself lives off-server. This
  is knowingly lower-assurance than local PDFs (Drive's own link-sharing
  governs the file once someone has the link) — documented as a trade-off
  in `docs/ARCHITECTURE.md` §4.3.1, not silently accepted.

## Conventions

- Commit messages: imperative, one line, no AI attribution beyond what the
  harness appends automatically.
- Keep `docs/ROADMAP.md` checkboxes current as phases complete.
