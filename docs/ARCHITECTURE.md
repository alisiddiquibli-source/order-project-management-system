# System Design

> **v3 note:** this revision resolves the 15 gaps raised by an external
> review (business rules, responsibilities, workflow gaps) plus two
> clarifications from BLI: an **order is one machine**, and for stages
> 9–12 the **Installation & Service Engineer submits findings, the Project
> Coordinator records stage completion**. Where a gap needed a business
> decision rather than an engineering default, the resolution BLI chose is
> stated explicitly.

## 1. Purpose

Track a customer engagement from requirement to post-handover service, for
**Business Links International (BLI)**, across two kinds of audiences:

- **Internal team** — full visibility, with roles split by function (§7).
  BLI has multiple people in the same role (several Project Coordinators,
  several Sales Managers, etc.) — each person has **one login**, and that
  login sees every project/order they're assigned to, whatever the role.
- **External parties** — observer + commenter only, no data entry:
  - **Customer** — one login *per project* (§2), seeing every machine/order
    in that project.
  - **Supplier** — one login *per supplier company*, scoped to **all**
    projects/orders that company supplies to BLI, not just one.

Because external logins exist, **data isolation is a first-class
requirement**: a customer must never see another customer's project, and a
supplier must never see another supplier's pricing, schedule, or documents
for an order it isn't part of.

## 2. Project vs. Order — a deal can have several machines

**A Project is one customer engagement/deal. An Order is one machine.** A
project can contain multiple orders (e.g., a customer buying three
different machines in one deal = one project, three orders), and **each
order runs its own 12-stage pipeline independently** — different
manufacturing timelines, different FAT dates, different install dates —
while rolling up under the same project for reporting.

```
projects (id, project_number, customer_name, customer_contact, title,
          sales_manager_id,          -- owns the whole deal
          project_coordinator_id,    -- default PC for the whole deal
          status, created_by)

orders   (id, project_id, order_number, machine_name, machine_spec,
          quantity, supplier_id, contract_value, currency,
          start_date, target_handover_date, status,
          project_coordinator_id,    -- nullable override of the project's PC,
                                      -- for when one machine needs a different PC
          installation_engineer_id,  -- always set per order — install visits
                                      -- are scheduled per machine, can differ
                                      -- even within one project
          created_by)
```

Assignment defaults: **Sales Manager and (usually) Project Coordinator are
assigned once per project**; Installation & Service Engineer and Supplier
are assigned **per order**, since those vary machine-to-machine even inside
one deal. A specific order can override the project's default PC if that
one machine needs a specialist.

**Customer login scope moves to the project**: `users.scope_project_id`
(not `scope_order_id`) — one login sees every machine/order in their
project, which is what a customer buying multiple machines in one deal
actually wants.

Everywhere below, "order" means one machine's pipeline; "project" means the
containing deal.

## 3. Workflow — the order (machine) pipeline

Every order moves through a fixed sequence of stages, followed by an
open-ended post-handover service phase.

| # | Stage | Executed by (real world) | Recorded in system by |
|---|-------|---------------------------|-------------------------------|
| 1 | Requirements captured | Sales Manager + customer | Project Coordinator |
| 2 | Order placed (PO issued) | Project Coordinator | Project Coordinator |
| 3 | Machine manufacturing progress (supplier site) | Supplier | Project Coordinator |
| 4 | Machine testing material coordination | Project Coordinator / Supplier | Project Coordinator |
| 5 | Machine FAT readiness / FAT execution | Supplier, witnessed remotely/on-site | Project Coordinator |
| 6 | Shipment coordination | Project Coordinator | Project Coordinator |
| 7 | Import clearance in Pakistan | **Customer's own import team** — BLI only coordinates | Project Coordinator |
| 8 | Delivery to customer | **Customer's own import team** — BLI only coordinates | Project Coordinator |
| 9 | Installation at customer site | **Installation & Service Engineer** — submits findings/report | Project Coordinator records stage completion from the Engineer's submission |
| 10 | SAT (Site Acceptance Test) | **Installation & Service Engineer** executes with customer; **Engineer submits the result** | Project Coordinator records stage completion from the Engineer's submission |
| 11 | Training | **Installation & Service Engineer** — submits attendance/training record | Project Coordinator records stage completion from the Engineer's submission |
| 12 | Handover | Project Coordinator + customer | Project Coordinator |
| — | **Post-handover service** (ongoing) | Installation & Service Engineer | Installation & Service Engineer, directly (no PC hand-off — see §5) |

**Resolving review point 1 (Coordinator vs. Engineer):** the Engineer never
flips `order_stages.status` directly — that stays the Coordinator's job, so
the master pipeline record still has one point of entry, as everywhere
else. What changed is that the Engineer now has **direct write access to
the stage-specific evidence tables** for stages 9–11 (installation report,
`fat_sat_records` for SAT, the new `training_records` — §5), and the
Coordinator's job for those three stages becomes *recording completion
based on what the Engineer already submitted*, not re-typing it from
scratch. Post-handover service tickets/AMC are the one place the Engineer
has always managed data directly, since there's no "stage" pipeline record
there to protect.

BLI does not track the supplier's own raw-material import/procurement —
scope starts once the machine is in manufacturing. BLI also does not
execute Pakistan customs clearance or final delivery (stages 7–8) — the
**customer's own import team** does; BLI's Project Coordinator coordinates,
and the **Import Manager joins as an advisor alongside the PC and Sales
Manager only if the customer's import team asks for help** — not a
standing responsibility on every order.

### 3.1 Stage dependencies (resolves review point 4)

Stages default to sequential, but some legitimately overlap. The rule is:
an order_stage cannot be marked `completed` while a **hard prerequisite**
stage is still open, unless an explicit exception is recorded.

| Stage | Can start in parallel with | Hard prerequisite to *complete* |
|---|---|---|
| 3 Manufacturing | 4 (testing material coordination often runs alongside) | 2 (order placed) |
| 4 Testing material coordination | 3 | 2 |
| 5 FAT | may be scheduled while 3/4 are finishing | 3 substantially complete (PC's judgment — not hard-blocked) |
| 6 Shipment coordination | may start (freight booking) while 5 is still in progress | **Dispatch (marking 6 `completed`) requires 5 `completed`, OR an approved exception** |
| 7 Import clearance | — | 6 completed (goods must be shipped) |
| 8 Delivery | — | 7 completed |
| 9 Installation | — | 8 completed (machine physically on site) |
| 10 SAT | — | 9 completed |
| 11 Training | may run in the same visit as 10 | none (soft — commonly concurrent with SAT) |
| 12 Handover | — | 10 completed AND 11 completed |

Exceptions (e.g., shipping before FAT fully closes for a commercial
reason) are recorded, not silently allowed:

```
stage_exceptions (id, order_stage_id, prerequisite_stage_id,
                   reason, approved_by, approved_at)
```

Only a **Sales Manager or Company Owner** can approve a `stage_exceptions`
row — a Project Coordinator can request one via comment, but can't
self-approve skipping a hard prerequisite.

### 3.2 Stage completion criteria (resolves review point 3)

| Stage | "Completed" requires |
|---|---|
| 1 Requirements | `requirements.approved_by`/`approved_at` set |
| 2 Order placed | PO document uploaded (`documents.type = PO`) |
| 3 Manufacturing | every `manufacturing_milestones` row `status = done` |
| 4 Testing material | PC-confirmed status + notes (no sub-table; low complexity) |
| 5 FAT | `fat_sat_records` (type FAT) `result = pass`, or `conditional_pass` **with an `acceptances` record** (§3.4) — never just an empty punch list |
| 6 Shipment | `shipments` row exists with carrier + ETD, and §3.1's dependency is satisfied |
| 7 Import clearance | `customer_import_tracking.latest_status = cleared` (§8) |
| 8 Delivery | delivery document uploaded or customer confirms receipt |
| 9 Installation | Engineer's installation report/photos submitted |
| 10 SAT | `fat_sat_records` (type SAT) `result = pass` or `conditional_pass` **with an `acceptances` record** |
| 11 Training | `training_records` shows attendance **and** an `acceptances` (training_ack) record |
| 12 Handover | handover certificate uploaded **and** an `acceptances` (handover_confirmation) record |

### 3.3 FAT/SAT outcomes, severity, and retesting (resolves review point 5)

`punch_list_items` gets a `severity` field: `critical | minor`.

- **`fail`** result → stage cannot proceed at all. A retest is required:
  create a new `fat_sat_records` row for the same `order_stage_id`, and
  mark the prior one `superseded_by` the new row's id.
- **`conditional_pass`** → only valid if **every open punch-list item is
  `minor`**. A single open `critical` item forces `fail`, not
  `conditional_pass` — there is no "pass with a critical issue open."
- **A `conditional_pass` is not usable until it has an explicit
  `acceptances` record** (§3.4) — closing every punch-list item is not
  itself acceptance. This directly addresses the review's point: *"a
  failed test should not become acceptable merely because its issue list
  is empty."*

### 3.4 Explicit acceptance vs. ordinary comments (resolves review point 6)

Acceptance is a deliberate, auditable action — not inferred from a
friendly comment:

```
acceptances (id, order_stage_id, type[fat_conditional|sat_result|training_ack|handover_confirmation],
             accepted_by_type[customer|sales_manager], accepted_by_user_id,
             conditions_notes, accepted_at)
```

**Who may accept a FAT/SAT conditional pass: the Sales Manager or the
customer, whichever confirms first** — both are authorized, recorded either
way, since the customer isn't always actively engaged at the FAT stage
(before the machine has even shipped) but is always available by SAT.
Handover confirmation follows the same either/or rule. `acceptances` rows
are append-only — never edited or deleted, only superseded by a new
acceptance if something changes.

## 4. Stage-specific detail & deadline alerts

### 4.1 Target dates — set manually, with a change history (resolves review point 8)

Machine type and supplier lead times vary too much for a fixed template, so
the **Project Coordinator sets `planned_start`/`planned_end` for every
stage by hand**. Once set, the *original* commitment is preserved
separately from the *current* plan:

```
order_stages (id, order_id, stage_id, status,
              original_planned_start, original_planned_end,  -- set once, immutable
              planned_start, planned_end,                     -- current agreed plan, mutable
              actual_start, actual_end, updated_by, notes)

commitment_changes (id, order_id, order_stage_id,   -- one of these two set
                     field_name, old_value, new_value,
                     reason, changed_by, customer_informed, changed_at)
```

Any change to a `planned_end` (stage-level) or `target_handover_date`
(order-level) writes a `commitment_changes` row — reason, who authorized
it, and whether the customer was told. This is what lets the Sales Manager
or Owner later see "we originally committed to X, we're now planning for
Y, and here's why."

### 4.2 Manufacturing progress (stage 3) — milestone checklist

```
manufacturing_milestones (id, order_stage_id, name, sequence,
                           planned_date, actual_date,
                           status[pending|done], notes)
```

Per-order checklist (machines differ, so this isn't a fixed global
template) — typical items: design/drawing approval, fabrication, assembly,
painting/finishing, packing & ready for FAT.

### 4.3 FAT, SAT & training records

```
fat_sat_records   (id, order_stage_id, type[FAT|SAT], scheduled_date,
                    actual_date, result[pass|fail|conditional_pass],
                    superseded_by, report_document_id, notes)

punch_list_items  (id, fat_sat_record_id, description, severity[critical|minor],
                    raised_by, status[open|resolved], resolved_at, resolved_by)

training_records  (id, order_stage_id, scheduled_date, actual_date,
                    attendees, materials_provided, report_document_id, notes)
```

`report_document_id` links to the uploaded report in `documents`.

### 4.4 Deadline & at-risk alerts — automatic, both directions

A daily cron job (`check_stage_deadlines.php`) scans all `order_stages`
where `status` is `not_started` or `in_progress`:

- **Early warning** — `planned_end` within **3 days** (configurable) and
  not finished → "at risk" notification, no status change.
- **Auto-overdue** — `planned_end` passed and not `completed` → status
  becomes `delayed`, overdue notification fires.

Recipients: the order's **Project Coordinator**, its **Sales Manager**, and
**every Company Owner**. Same check runs against `target_handover_date` at
the order level.

### 4.5 Blocked work is monitored harder, not excluded (resolves review point 9)

A `blocked` stage is **not** exempt from monitoring — it's the opposite:
it needs the most attention. Marking a stage `blocked` requires logging why:

```
blockers (id, order_stage_id, description, responsible_party,
          next_action, next_review_date, raised_at, raised_by,
          resolved_at, resolved_by)
```

`description`, `responsible_party`, and `next_action`/`next_review_date`
are **required fields** when a stage is set to `blocked` — not optional
metadata. The daily cron also scans open `blockers`: if `next_review_date`
passes without an update, or the blocker has been open **7 days** without
resolution, it escalates — a notification to the order's **Sales Manager
and every Company Owner** (beyond the PC, who already knows), specifically
flagged as needing intervention rather than routine tracking.

## 5. Post-handover service module (resolves review point 12)

```
amc_contracts    (id, order_id, start_date, end_date, frequency,
                   coverage_terms, notes)

amc_visits       (id, amc_contract_id, scheduled_date, actual_date,
                   assigned_engineer_id, notes)

service_tickets  (id, order_id, type[warranty_claim|amc_visit|complaint|other],
                   severity, response_target_hours,
                   opened_by, assigned_engineer_id,
                   status[open|in_progress|resolved|closed],
                   description, resolution_notes,
                   opened_at, resolved_at, resolved_by,
                   closed_at, closed_by)
```

`orders` gains `warranty_start_date`/`warranty_end_date`, set at handover.
**`resolved` vs. `closed` are distinct**: `resolved` means the Engineer
applied a fix; `closed` means the customer (or PC on the customer's behalf,
if unresponsive after a defined period) confirmed satisfaction — a ticket
can sit `resolved` without being `closed` if nobody's confirmed it yet.
`response_target_hours` is the SLA commitment by ticket severity, used the
same way as stage deadlines (§4.4) to flag an unanswered ticket as at-risk.

Customers raise tickets via their project login (comment mechanism, routed
to a queue). Company Owners see open/overdue tickets and AMC visits due
across the whole portfolio. Installation & Service Engineers manage all of
this **directly** — no Project Coordinator hand-off, since there's no
"pipeline stage" to protect a single point of entry for here.

## 6. Comment channels — internal, customer, supplier (resolves review point 7)

`comments` gains an explicit `channel`, so internal discussion is never
accidentally exposed:

```
comments (id, project_id, order_id, order_stage_id, channel[internal|customer|supplier],
          user_id, message, created_at)
```

- **`internal`** (default for internal-staff comments) — visible to
  internal roles with access to that order only. Never shown to a customer
  or supplier login.
- **`customer`** — visible to internal roles + that order's/project's
  customer login. A customer never sees the `supplier` channel.
- **`supplier`** — visible to internal roles + that order's supplier
  login. A supplier never sees the `customer` channel.

Internal staff can read and post on all three channels for orders they
have access to; a customer login can only see/post on `customer`; a
supplier login can only see/post on `supplier`. This is the same kind of
scoping as `documents.visibility`, applied to discussion instead of files.

## 7. Roles & permissions

| Role | Assigned how | Scope |
|------|--------------|-------|
| **Company Owner** | One login per person; role-based | **Full visibility across the entire portfolio** — every project/order, stage/milestone/FAT-SAT/shipment/document/service ticket, who's assigned where, every deadline/at-risk alert and AI advisory at portfolio scope. Also holds **account administration** (§7.1). No project data entry. |
| **Sales Manager** | One login per person; `projects.sales_manager_id` | **Primary accountable custodian of the project.** Full read visibility into everything on every order in their assigned project(s) — every stage, milestone, FAT/SAT/training record, shipment, document, service ticket — plus comment/direct-instruction rights to the PC, and acceptance authority (§3.4). Doesn't enter stage data directly. |
| **Project Coordinator** | One login per person; `projects.project_coordinator_id`, overridable per order | Full read/write on every order they're assigned to: creates the project/order, records all 12 stages (from their own work or the Engineer's submissions) + documents + shipments. Accountable to that project's Sales Manager. |
| **Import Manager** | One login per person; global advisory role | Read access to all orders; comments on stages 6–8 jointly with the PC and Sales Manager, only when the customer's import team needs input. No stage-status edit rights. |
| **Installation & Service Engineer** | One login per person; `orders.installation_engineer_id` | Full read/write on stages 9–11's **evidence tables** (installation report, `fat_sat_records`/SAT, `training_records`) for their assigned orders; the PC still records the stage `completed` status from that evidence (§3). Directly manages `service_tickets`/`amc_contracts`/`amc_visits` post-handover with no PC hand-off. Accountable to that order's Sales Manager. |
| **Supplier** (external) | One login per supplier company | Observer + comment (`supplier` channel only) across every order linked to that supplier (`orders.supplier_id`). Sees stages 3–6 detail on those orders, not commercial terms with the customer. |
| **Customer** (external) | One login per project | Observer + comment (`customer` channel only) on every order in their project (`scope_project_id`). Can raise a service ticket post-handover, and has acceptance authority on FAT-conditional/SAT/training/handover (§3.4). |

**Accountability model:** per project, the **Sales Manager is the
responsible owner of the outcome** — the Project Coordinator, Import
Manager (when advising), and Installation & Service Engineer are all
effectively reporting to that project's Sales Manager. The **Company Owner
sits above all of it**, with the same treatment applied portfolio-wide.
This is an accountability/visibility relationship, not a data-entry one —
it changes who the system proactively surfaces information and AI
recommendations to, not who's allowed to write what.

Every API request is authorized server-side against the requester's actual
scope — never a client-supplied id alone:
- Company Owner / Import Manager → role check only.
- Sales Manager → `order.project.sales_manager_id` = requester.
- Project Coordinator → `order.project_coordinator_id` = requester, or
  (`order.project_coordinator_id IS NULL` and `order.project.project_coordinator_id` = requester).
- Installation & Service Engineer → `order.installation_engineer_id` = requester.
- Supplier → `order.supplier_id` = requester's `supplier_id`.
- Customer → `order.project_id` = requester's `scope_project_id`.

### 7.1 Account administration (resolves review point 13)

**Company Owner holds account administration** — creating/deactivating
logins, resetting passwords, assigning roles and project/order assignments.
This is a distinct capability from project data entry (it's account
management, not editing a stage), so it doesn't conflict with "Owner has no
data entry" — that rule is about project records, not user accounts.

### 7.2 Staff absence & reassignment (resolves review point 10)

Reassigning `sales_manager_id` / `project_coordinator_id` /
`installation_engineer_id` is never a silent overwrite:

```
assignment_history (id, project_id, order_id, role,
                     previous_user_id, new_user_id,
                     reason[temporary_cover|permanent_reassignment],
                     cover_end_date, changed_by, changed_at)
```

Temporary cover sets a `cover_end_date`; past that date the system prompts
whoever's watching (Sales Manager/Owner) to confirm a revert or make it
permanent. Open blockers, comments, and history stay attached to the
project/order, not the person, so accountability isn't lost when the
assignee changes — only who's currently responsible changes.

## 8. Import & delivery coordination detail (resolves review point 11)

Since stages 7–8 are executed by the customer's own import team, BLI needs
a record of what's actually happening on their side, not just a status
label:

```
customer_import_tracking (id, order_id, customer_contact_name,
                           customer_contact_email, customer_contact_phone,
                           latest_status, outstanding_documents,
                           expected_date, next_follow_up_date,
                           import_manager_engaged_at,
                           import_manager_disengaged_at, notes)
```

One row per order, covering both stage 7 and 8 (same customer team handles
both). `import_manager_engaged_at`/`disengaged_at` record exactly when the
Import Manager's advisory involvement started and ended, per §3 — so it's
never ambiguous whether they're still "on" an order.

## 9. Core data model (consolidated)

```
projects          (id, project_number, customer_name, customer_contact, title,
                   sales_manager_id, project_coordinator_id, status, created_by)

suppliers         (id, name, contact_email, contact_phone)

users             (id, name, email, password_hash, role, status,
                   scope_project_id,  -- set only for customer logins
                   supplier_id)       -- set only for supplier logins

orders            (id, project_id, order_number, machine_name, machine_spec,
                   quantity, supplier_id, contract_value, currency,
                   start_date, target_handover_date, status,
                   project_coordinator_id, installation_engineer_id,
                   warranty_start_date, warranty_end_date, created_by)

requirements      (id, order_id, description, document_ref, version,
                   approved_by, approved_at)

stages            (id, name, sequence)

order_stages      (id, order_id, stage_id, status,
                   original_planned_start, original_planned_end,
                   planned_start, planned_end, actual_start, actual_end,
                   updated_by, notes)

commitment_changes (id, order_id, order_stage_id, field_name,
                    old_value, new_value, reason, changed_by,
                    customer_informed, changed_at)

stage_exceptions  (id, order_stage_id, prerequisite_stage_id,
                   reason, approved_by, approved_at)

manufacturing_milestones (id, order_stage_id, name, sequence,
                   planned_date, actual_date, status, notes)

fat_sat_records   (id, order_stage_id, type, scheduled_date, actual_date,
                   result, superseded_by, report_document_id, notes)

punch_list_items  (id, fat_sat_record_id, description, severity,
                   raised_by, status, resolved_at, resolved_by)

training_records  (id, order_stage_id, scheduled_date, actual_date,
                   attendees, materials_provided, report_document_id, notes)

acceptances       (id, order_stage_id, type, accepted_by_type,
                   accepted_by_user_id, conditions_notes, accepted_at)

blockers          (id, order_stage_id, description, responsible_party,
                   next_action, next_review_date, raised_at, raised_by,
                   resolved_at, resolved_by)

documents         (id, project_id, order_id, order_stage_id, type, file_path,
                   uploaded_by, visibility[internal|supplier|customer|shared])

shipments         (id, order_id, carrier, mode[sea|air|road],
                   port_of_loading, port_of_discharge, bl_awb_number,
                   etd, eta, customs_status, notes)

customer_import_tracking (id, order_id, customer_contact_name,
                   customer_contact_email, customer_contact_phone,
                   latest_status, outstanding_documents, expected_date,
                   next_follow_up_date, import_manager_engaged_at,
                   import_manager_disengaged_at, notes)

comments          (id, project_id, order_id, order_stage_id, channel,
                   user_id, message, created_at)

amc_contracts     (id, order_id, start_date, end_date, frequency,
                   coverage_terms, notes)

amc_visits        (id, amc_contract_id, scheduled_date, actual_date,
                   assigned_engineer_id, notes)

service_tickets   (id, order_id, type, severity, response_target_hours,
                   opened_by, assigned_engineer_id, status, description,
                   resolution_notes, opened_at, resolved_at, resolved_by,
                   closed_at, closed_by)

assignment_history (id, project_id, order_id, role, previous_user_id,
                   new_user_id, reason, cover_end_date, changed_by, changed_at)

notifications     (id, user_id, order_id, type, message, read_at, created_at)

ai_reports        (id, order_id, type, provider, prompt, response,
                   status[new|acknowledged|dismissed|actioned],
                   acknowledged_by, acknowledged_at, action_notes,
                   created_by, created_at)
```

`documents.visibility` and `comments.channel` are enforced on every read —
an external-facing endpoint never returns internal-only content regardless
of what the client requests. `order_line_items` from the earlier draft is
gone — since an order is one machine, its spec lives directly on `orders`
(`machine_name`, `machine_spec`, `quantity`).

**Deferred, not built (resolves review point 14):** BLI confirmed no
payment/value tracking is needed at this stage. `orders.contract_value`/
`currency` remain as static reference fields only — not actively monitored,
reported on, or tied to any milestone logic. No invoicing, payments, or
outstanding-balance tracking is in scope; that stays in BLI's existing
accounting tools.

## 10. AI integration layer

A provider-agnostic service so the system can call **Claude, Gemini, or
ChatGPT** interchangeably:

```
AiAdvisorService
├── ClaudeAdapter
├── GeminiAdapter
└── ChatGptAdapter
```

Use cases:
- **Status reports** — narrative summary on demand. Primary destination is
  the **Sales Manager's dashboard** (per project) and the **Company
  Owner's** portfolio roll-up.
- **Risk advisory (per order)** — flags at-risk stages and recommends a
  specific next action, surfaced to the **Sales Manager**, **Project
  Coordinator**, and **Company Owner** jointly. Complements, not replaces,
  the deterministic deadline/blocker alerts in §4.4–4.5.
- **Portfolio advisory (Company Owner only)** — cross-project patterns: a
  PC or Sales Manager with multiple orders trending delayed, a supplier
  with recurring FAT failures.
- **Follow-up drafting** — draft a follow-up comment/message (on the right
  channel — §6) to a supplier/customer based on current stage status.
- **Monitoring digest** — daily cron scan across active orders and open
  service tickets, to Company Owners portfolio-wide and, per project, its
  Sales Manager and PC.

**Recommendations are advisory, not directives (resolves review point
15):** every AI output is logged in `ai_reports` with a status
(`new → acknowledged/dismissed/actioned`). The responsible person
(Sales Manager, PC, or Owner depending on scope) explicitly acknowledges,
dismisses, or turns it into a tracked action — the system never
auto-executes a recommendation. **Portfolio advisory judges by delay
*cause and responsibility*, not raw overdue counts** — a PC whose delays
trace to the customer's import team or a supplier's manufacturing slip
isn't scored the same as one whose delays trace to their own inaction;
this uses the `responsible_party` field on `blockers` and the executor
recorded on `commitment_changes`, not a naive tally.

Rules:
- API keys live server-side only, never sent to the frontend or accessible
  to supplier/customer sessions.
- Every AI call is scoped to data the requesting user is already allowed
  to see.
- AI features are on-demand or scheduled batch, not per page load.

## 11. Tech stack

- **Backend**: PHP 8 + PDO/MySQL, REST API (JSON) — same pattern as the
  team's housekeeping-system project, Bluehost shared hosting compatible.
- **Frontend**: SPA (Vue or React), static build, role-based app shells for
  internal / supplier / customer.
- **Auth**: JWT (short-lived access + refresh token), `password_hash()`.
- **File storage**: outside the public web root, served only through an
  authenticated endpoint checking `visibility` and the requester's scope.
- **Email**: PHPMailer via Bluehost SMTP for alerts and the AI digest.
- **Scheduling**: Bluehost cPanel cron — `check_stage_deadlines.php`
  (daily, §4.4–4.5), AI monitoring digest, AMC visit reminders.

## 12. Security notes

- Force HTTPS (Bluehost's free SSL).
- Every external-facing endpoint re-checks the requester's actual scope
  server-side on every request: `scope_project_id` for a customer,
  `supplier_id` for a supplier.
- Login rate-limiting/lockout on externally exposed portals.
- `acceptances` and `commitment_changes` are **append-only** — never
  edited or deleted, only superseded — since they're the audit trail for
  contractual commitments and sign-offs.
- Regular DB backups (cPanel automated + periodic manual dump) — this is
  the system of record for SAT sign-off, handover, and service history.
