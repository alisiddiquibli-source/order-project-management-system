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
- **SAT, Training, and Handover require genuine customer acceptance to complete** —
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

## Backend codebase map

- `src/Auth/` — `Jwt` (HS256 wrapper), `Authenticator` (login/tokens,
  `requireAuth()`/`requireRole()`), `Scope` (builds the authorization
  WHERE-clause per role — every list/get query for a project or order
  goes through this, never a bare `WHERE id = ?`).
- `src/Models/` — one repository per table cluster: `ProjectRepository`,
  `OrderRepository`, `OrderStageRepository`, `DocumentRepository`,
  `CommentRepository`, `RequirementRepository`,
  `ManufacturingMilestoneRepository`, `FatSatRepository` (+ punch list),
  `EngineerReportRepository`, `TrainingRecordRepository`,
  `AcceptanceRepository`, `StageExceptionRepository`,
  `ShipmentRepository`, `CustomerImportTrackingRepository` (+ its
  append-only `_updates` history child), `NotificationRepository` (writes
  the `notifications` row and fires the best-effort email alongside it —
  every notification, cron- or comment-triggered, goes through this, never
  a raw `INSERT INTO notifications`), `AmcContractRepository` (+ its AMC
  visits), `ServiceTicketRepository` (`advanceStatus()` only ever walks a
  ticket open -> in_progress -> resolved; closing is `confirmClosure()`
  — the customer's own confirmation — or the SLA cron's `autoClose()`,
  never a status an Engineer can set directly), `AiReportRepository`
  (`findVisibleToUser()` runs three separate queries — order-scope,
  project-scope, portfolio/Owner-only — rather than one merged query,
  since `Scope::forOrders()`/`forProjects()` use different table aliases
  and forcing them together meant alias collisions).
  `findByIdForUser()`-style methods return `null` for both "doesn't
  exist" and "not authorized" — routes turn that into a 404, never a 403,
  so existence is never leaked. `DocumentRepository`/`CommentRepository`
  additionally filter by `visibility`/`channel` per role (see
  `visibilityFilter()`/`channelFilter()`), separate from the order-level
  scope check. `OrderRepository`/`ProjectRepository` additionally run
  every row through `redactForRole()` before returning it — **row-level
  scope (who can see this order at all) and field-level scope (which
  columns of it they can see) are different checks; a role can pass the
  first and still need columns stripped.** Caught late: Phase 1-4 had
  `SELECT o.*`/`SELECT p.*` reaching a supplier login with
  `contract_value`/`currency`/`customer_name` intact, missed until the
  Supplier dashboard's own live-API check surfaced it (docs/ROADMAP.md).
  When adding a new supplier- or customer-facing read, check whether it
  needs a `redactForRole()` step too — don't assume row-level scoping
  alone is enough.
- `src/Domain/` — business-rule logic that isn't simple CRUD:
  `StageCompletionEvaluator` (the §3.1/§3.2 gate for marking a stage
  `completed`), `AcceptanceRules` (which acceptance type/target table a
  stage takes, and which role records FAT vs SAT), `DeadlineScanner` (the
  daily cron's actual logic — see below), `BusinessHours` (SLA elapsed-time
  math in actual business hours/days, not calendar time — configurable
  window via `BUSINESS_HOURS_START`/`_END`/`BUSINESS_DAYS`), `TicketSlaScanner`
  (the hourly ticket-SLA cron's logic, using `BusinessHours`),
  `AiDataGatherer` (§10 — **the scope filter for every AI use case lives
  here, not the route**; each method re-authorizes from the requester's
  claims same as any other read, and portfolio advisory is gated
  Owner-only inside the gatherer itself, independent of the route's own
  role check; the `*Unscoped()` variants exist only for the digest cron,
  which has no request claims to check against — never call one of those
  from a route), `AiDigestScanner` (the daily AI-digest cron's logic).
  New cross-cutting rules belong here, not scattered across route handlers.
- `src/Ai/` — the provider-facing half of §10, kept separate from
  `Domain` because it's one cohesive subsystem (matches the
  `AiAdvisorService`/`ClaudeAdapter`/`GeminiAdapter`/`ChatGptAdapter`
  diagram in docs/ARCHITECTURE.md §10): `ProviderAdapter` (the interface
  every provider implements), `ClaudeAdapter`/`GeminiAdapter`/`ChatGptAdapter`
  (one HTTP call each, via `HttpJsonClient`; `*_API_BASE_URL` env vars
  exist only to point an adapter at a local test double, never set in
  production), `AiAdvisorService` (orchestrates gather -> prompt -> call
  -> persist for all four use cases, and holds every system/user prompt
  template — see its `render*Prompt()` methods, which `AiDigestScanner`
  also calls directly for the cron path). A provider call failure is an
  `AiProviderException`, turned into a 502 by the route — never a 500,
  and never a written `ai_reports` row for the failed attempt.
- `src/Http/` — framework bits (`Router`, `Request` — including
  multipart/`$_FILES` support for document uploads, `Response`) plus
  `OrderAccess`, a shared "load this order/stage or 404" helper (including
  `requireVisibleStageByPk()` for flat evidence routes like
  `/api/fat-sat/{id}/result` that aren't nested under `/orders/{id}/...`).
- `src/routes/*.php` — route registration, split by domain
  (`health_and_auth.php`, `projects.php`, `orders.php`, `evidence.php`,
  `comments.php`, `logistics.php`, `service.php` — AMC + service tickets,
  `ai.php`), required from `src/routes.php`. Keep splitting further
  before any one file gets unwieldy — that's already why this isn't one
  big `routes.php`.
- `cron/check_stage_deadlines.php` — thin CLI entry point; the actual
  logic lives in `src/Domain/DeadlineScanner.php` so it's testable
  without shelling out. Run daily via Bluehost cPanel cron. Idempotent —
  safe to re-run same-day without duplicate notifications (dedupes on
  `(user_id, order_id, type, DATE(created_at))`).
- `cron/check_ticket_sla.php` — same pattern, but **hourly** (a daily scan
  can't catch an hour-level SLA breach in time) and backed by
  `src/Domain/TicketSlaScanner.php`.
- `cron/check_ai_digest.php` — daily, backed by `src/Domain/AiDigestScanner.php`.
  **Makes one real AI provider call per active project plus one portfolio
  call, every day it runs** — confirm that recurring per-call cost is
  acceptable to BLI before enabling this cron in production, it's not
  free like the other two crons.
- `src/Notifications/Mailer.php` — thin PHPMailer/SMTP wrapper, called
  only from `NotificationRepository`. Best-effort by design: catches its
  own exceptions and logs to `error_log`, never throws — a mail-server
  outage must never break the API request or cron run that triggered the
  notification. With `MAIL_HOST` unset (local dev) it logs instead of
  attempting delivery, so local work never needs real SMTP creds.
- `storage/documents/` — local file storage for uploaded PDFs, outside
  `public/`, never served as a static file — only through the
  authenticated `/api/documents/{id}/file` endpoint. Actual files are
  gitignored (`.gitkeep` only); `DocumentRepository::storeUploadedFile()`
  whitelists extensions and never trusts the client-supplied filename for
  the stored path.

## Frontend codebase map

React + TypeScript + Vite + Tailwind CSS v4, in `frontend/`. See
`frontend/README.md` for dev setup. Structure mirrors the backend's
separation of concerns:

- `src/lib/api.ts` — the one fetch wrapper every page uses. Attaches the
  JWT, retries exactly once on a 401 via silent refresh, then forces
  re-login — never loops.
- `src/lib/auth.tsx` — `AuthProvider`/`useAuth()`, the logged-in user's
  identity and role (drives which dashboard renders).
- `src/lib/types.ts` — TypeScript shapes mirroring the backend's JSON —
  keep these in sync when a response shape changes.
- `src/components/StatusBadge.tsx` — the *only* place a stage/order
  status renders anywhere in the app. Never hand-roll a status pill
  elsewhere — status must read identically on every screen (§11.1).
- `src/components/OrderPortfolioTable.tsx` — the "every order I can see"
  table + summary cards shared by Owner/Sales Manager/Import Manager
  dashboards, plus `loadPortfolio()`, the client-side orders+stages fetch
  they all use. Don't re-copy this table into a fourth dashboard — extend
  it or compose around it instead.
- `src/components/CommentsPanel.tsx` / `ServiceTicketsPanel.tsx` — order
  detail page panels. The ticket panel deliberately has no "close" button
  for an Engineer — advancing a ticket only ever goes open ->
  in_progress -> resolved from the UI; closing is the customer's
  confirm-closure action or the SLA cron, matching
  `ServiceTicketRepository::advanceStatus()` server-side.
- `src/components/StageEvidence.tsx` — dispatches to the right evidence
  sub-form(s) for a stage by `stage_id`
  (`RequirementsSection`/`DocumentsSection`/`MilestonesSection`/
  `FatSatSection`/`EngineerReportSection`/`TrainingSection`/
  `AcceptanceSection`), deliberately mirroring
  `StageCompletionEvaluator`'s own per-stage checks — what the UI asks
  for filling in should always be exactly what the server gates
  completion on. `AcceptanceSection` auto-selects the current eligible
  target record (the live FAT/SAT attempt, latest training record,
  latest handover-readiness report) rather than offering a picker —
  there's only ever one live candidate. Stages 6-8 have no sub-form yet
  (shipment/import-tracking UI doesn't exist); stage 4 needs no sub-form
  at all — it's satisfied by the note already on `StageUpdateForm`.
  When adding a stage's evidence UI, check evidence.php first for a GET
  list route — several existed only as `listForStage()`/`listForOrder()`
  repository methods with no route exposing them until this pass added
  six (`requirements`, `milestones`, `fat-sat`, `punch-items`,
  `engineer-reports`, `training`, `acceptances`).
- `src/pages/` — one file per role's home view (`OwnerDashboardPage`,
  `SalesManagerDashboardPage`, `CoordinatorDashboardPage`,
  `ImportManagerDashboardPage`, `EngineerDashboardPage`,
  `SupplierDashboardPage`, `CustomerDashboardPage`), routed by role in
  `App.tsx`'s `HomePage`. A role with no dedicated view yet gets
  `ComingSoonPage`, not a broken screen — add its real dashboard as its
  own file when built, don't retrofit `ComingSoonPage` into one.
- Business-rule rejections from the API (422s) are shown to the user
  verbatim (see `StageUpdateForm` in `OrderDetailPage.tsx`) — that's
  deliberate, not a placeholder: the whole point of this system is that
  those rules are real, so the UI shouldn't hide them behind a generic
  "something went wrong."

## Known PHP/PDO gotcha — hit twice while building this, watch for it

`Database::connection()` deliberately sets
`PDO::ATTR_EMULATE_PREPARES => false` (real prepared statements, not
PHP-side emulation — safer, and how production should run). The cost:
**MySQL's native prepared statements reject reusing the same named
placeholder twice in one query** — `WHERE a = :x OR b = :x` throws
`SQLSTATE[HY093]: Invalid parameter number` at execute time, not at
prepare time, so it's easy to miss until it's actually run. Bind two
differently-named placeholders to the same value instead
(`:x_a`/`:x_b`). This bit both `Bli\Auth\Scope` (the PC scope filter) and
`OrderStageRepository::updatePlannedDates` (writing the same value to a
column and its `original_*` counterpart) during Phase 1 — both fixed, but
the next dynamic query built by hand should be tested against a real
`mysqld`, not just read back, precisely because this class of bug is
invisible until executed.

## Known ordering gotcha: evidence checks vs. the same request's own writes

`OrderStageRepository::updateStatus()` can receive `notes` and
`status=completed` in one PATCH. `StageCompletionEvaluator`'s stage-4
check queries the database's `notes` column directly — if the notes
UPDATE hasn't been applied yet when that check runs, a perfectly valid
combined request (set the confirming note and complete the stage in one
call) always fails, because the check sees the pre-request value. Fixed
by applying the notes write first, inside the same transaction, before
running the evidence check — with a rollback (notes included) if
completion is then refused, so a failed PATCH has no side effects. Only
found by an actual end-to-end UI walk through all 12 stages; a test that
completes a stage and sets its notes as two separate requests would never
hit this. **Any evidence check that reads the database directly (rather
than the in-memory state a route already has) needs to account for
writes made earlier in the same request/transaction, not just prior
ones** — check `StageCompletionEvaluator`'s per-stage query if adding
another field that can be set at completion time.

## Conventions

- Commit messages: imperative, one line, no AI attribution beyond what the
  harness appends automatically.
- Keep `docs/ROADMAP.md` checkboxes current as phases complete.
- Stage lookups always use the pipeline stage number (`stages.id`, 1–12),
  never `order_stages.id` (a global auto-increment, meaningless across
  orders) — `OrderStageRepository::find()` and every route path
  (`/orders/{id}/stages/{stageId}`) key on the former. A second bug from
  mixing these up only surfaced when testing against a *second* order —
  the first order's coincidental 1:1 id mapping masked it. Test with more
  than one record.
