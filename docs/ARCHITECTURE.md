# System Design

> **v4 note:** resolves two independent external reviews of v3. Both
> converged strongly on: SAT/handover need genuine customer acceptance
> (a Sales Manager can't accept on the customer's behalf without evidence
> of authorization), acceptance must be tied to a specific test/report
> revision (a retest voids the old acceptance), completion needs to mean
> *actually finished* not just *reported*, and several "mutable row with a
> notes field" spots needed a proper history instead. Where the two
> reviews disagreed only in emphasis, the stricter reading was taken —
> this system exists to prevent exactly the disputes a looser rule would
> allow.

## 1. Purpose

Track a customer engagement from requirement to post-handover service, for
**Business Links International (BLI)**, across two kinds of audiences:

- **Internal team** — full visibility, roles split by function (§7).
- **External parties** — **cannot edit operational/pipeline progress**, but
  can comment, raise service tickets, and record authorized acceptances
  (§3.4) — that's data too, just not pipeline data:
  - **Customer** — one login *per project* (§2), seeing every order in it.
  - **Supplier** — one login *per supplier company*, scoped to **all**
    orders that company supplies to BLI.

Data isolation is first-class: a customer never sees another customer's
project; a supplier never sees another supplier's pricing, schedule, or
documents; and on a multi-supplier project, one supplier never sees another
supplier's machine within the *same* project either (§6).

## 2. Project vs. Order — a deal can have several machines

**A Project is one customer deal. An Order is exactly one physical
machine** — not "up to N machines of a kind." If a customer orders three
identical units, that's three orders, because each physical machine gets
its own FAT, its own SAT, its own installation and acceptance — a shared
"quantity" field would let three machines hide behind one test record.
There is no `quantity` field on `orders` for this reason.

```
projects (id, project_number, customer_name, customer_contact, title,
          sales_manager_id, project_coordinator_id,   -- deal-level defaults
          status[active|completed], created_by)

orders   (id, project_id, order_number, machine_name, machine_spec,
          supplier_id, contract_value, currency,
          start_date, target_handover_date, status[active|on_hold|cancelled|completed],
          project_coordinator_id,    -- nullable override of the project's PC
          installation_engineer_id,  -- always set per order
          warranty_start_trigger[shipment|installation|sat|handover],
          warranty_start_date, warranty_end_date, created_by)

order_status_changes (id, order_id, old_status, new_status, reason,
                       changed_by, changed_at)
```

Sales Manager and (usually) PC are assigned once per **project**;
Installation & Service Engineer and Supplier are assigned **per order**,
since those vary machine-to-machine within one deal.

**Order lifecycle beyond the pipeline (new — reviews flagged this
missing):** an order can go `on_hold` or `cancelled`, not just move through
the 12 stages. Only a **Sales Manager or Company Owner** can set either —
never the PC unilaterally — logged in `order_status_changes`. While
`on_hold`, deadline/blocker alerts pause (no false escalation on a
deliberately paused order) but nothing is deleted; reopening resumes
monitoring from the current plan, replanning dates as normal via
`commitment_changes` (§4.1).

**Project completion**: a project reaches `status = completed` only when
**every one of its orders** is `completed` (handover done) or `cancelled`.
Post-handover service (§5) is tracked per order and keeps running
independently of the project's completion status — a project can be
"done" for delivery purposes while individual machines still have active
warranty/AMC service.

**Customer login is project-scoped** (`users.scope_project_id`) — one
login sees every order in their project.

Everywhere below, "order" = one machine's pipeline; "project" = the deal.

## 3. Workflow — the order (machine) pipeline

| # | Stage | Executed by (real world) | Recorded in system by |
|---|-------|---------------------------|-------------------------------|
| 1 | Requirements captured | Sales Manager + customer | Project Coordinator |
| 2 | Order placed (PO issued) | Project Coordinator | Project Coordinator |
| 3 | Machine manufacturing progress | Supplier | Project Coordinator |
| 4 | Machine testing material coordination | Project Coordinator / Supplier | Project Coordinator |
| 5 | Machine FAT readiness / FAT execution | Supplier, witnessed remotely/on-site | Project Coordinator |
| 6 | Shipment coordination | Project Coordinator | Project Coordinator |
| 7 | Import clearance in Pakistan | **Customer's own import team** — BLI coordinates | Project Coordinator |
| 8 | Delivery to customer | **Customer's own import team** — BLI coordinates | Project Coordinator |
| 9 | Installation at customer site | **Engineer submits an installation report** | PC records completion from it |
| 10 | SAT (Site Acceptance Test) | **Engineer executes with customer, submits the result** | PC records completion once a valid **customer** acceptance exists |
| 11 | Training | **Engineer submits attendance/training record** | PC records completion from it |
| 12 | Handover | **Engineer submits a handover-readiness report**; PC + customer complete it | PC records completion once a valid **customer** acceptance exists |
| — | **Post-handover service** (ongoing) | Installation & Service Engineer, directly | Engineer, directly — no PC hand-off |

The Engineer never flips `order_stages.status` — that stays the PC's job,
preserving one point of entry on the master pipeline record. What the
Engineer owns directly is the **evidence** for stages 9–12 (§4.3), via a
single `engineer_reports` table for installation and handover-readiness,
plus `fat_sat_records` for SAT and `training_records` for training. Stage
12 previously had no Engineer submission in this design — that was a gap
against BLI's own instruction ("stages 9–12 need Engineer update"), fixed
here: the Engineer confirms the machine is technically ready to hand over
before the PC and customer close it out.

BLI does not track the supplier's raw-material import — scope starts at
manufacturing. BLI does not execute Pakistan customs clearance or delivery
(stages 7–8) — the **customer's own import team** does; the PC coordinates,
and the **Import Manager advises alongside the PC and Sales Manager only
when asked** — not a standing duty on every order.

### 3.1 Stage dependencies and exceptions

| Stage | Can start in parallel with | Hard prerequisite to *complete* |
|---|---|---|
| 3 Manufacturing | 4 | 2 (order placed) |
| 4 Testing material coordination | 3 | 2 |
| 5 FAT | scheduled while 3/4 finish | starting FAT before 3 is fully `done` requires a **required PC note** justifying it — not silently allowed |
| 6 Shipment coordination | freight booking may start while 5 is open | **completing 6 (marking goods actually dispatched) requires 5 `completed`, OR an approved exception** |
| 7 Import clearance | — | 6 completed |
| 8 Delivery | — | 7 completed |
| 9 Installation | — | 8 completed |
| 10 SAT | — | 9 completed |
| 11 Training | may run in the same visit as 10 | none (soft) |
| 12 Handover | — | 10 completed AND 11 completed |

**Completing stage 6 means dispatch actually happened, not a booking.**
`shipments` needs an `actual_dispatch_date` (not just carrier + ETD) before
stage 6 can be marked `completed` — a freight booking alone only supports
`in_progress`.

Exceptions are recorded, never silent, and **narrowly scoped**:

```
stage_exceptions (id, order_stage_id, prerequisite_stage_id,
                   applies_to[open_minor_items|procedural_delay],
                   reason, approved_by, approved_at)
```

An exception can **never** be used against a `fail` result or an open
`critical` punch-list item — only against open `minor` items or a
procedural (non-quality) delay. Only a **Sales Manager or Company Owner**
approves one; a PC can request but not self-approve.

### 3.2 Stage completion criteria

| Stage | "Completed" requires |
|---|---|
| 1 Requirements | `requirements.approved_by`/`approved_at` set |
| 2 Order placed | PO document uploaded |
| 3 Manufacturing | a **non-empty** `manufacturing_milestones` checklist, every row `done` |
| 4 Testing material | PC-confirmed status + notes |
| 5 FAT | `result = pass`, or `conditional_pass` with a valid `acceptances` record tied to *this* `fat_sat_records` row (§3.3–3.4) |
| 6 Shipment | `shipments.actual_dispatch_date` set, and §3.1's dependency satisfied |
| 7 Import clearance | `customer_import_tracking` (stage 7 row) `latest_status = cleared` (§8) |
| 8 Delivery | `customer_import_tracking` (stage 8 row) `latest_status = delivered`, or a delivery document |
| 9 Installation | `engineer_reports` (type installation) `completion_status = complete`, no unresolved `outstanding_issues` |
| 10 SAT | `result = pass` or `conditional_pass`, **plus a valid customer acceptance** (§3.4 — Sales Manager alone is not sufficient here) |
| 11 Training | `training_records` attendance **and** a `training_ack` acceptance |
| 12 Handover | `engineer_reports` (type handover_readiness) `complete`, handover certificate uploaded, **plus a valid customer acceptance** |

### 3.3 FAT/SAT outcomes, severity, and retesting

`punch_list_items` gets `severity[critical|minor]`, plus follow-through
fields: `assigned_to`, `target_resolution_date`, `verified_by`,
`verified_at`, `carries_past_handover` (a minor item explicitly allowed to
stay open after handover, tracked onward as a service concern).

- **`fail`** → cannot proceed. Retest = new `fat_sat_records` row for the
  same `order_stage_id`; the prior row gets `superseded_by` set.
- **`conditional_pass`** → valid only if every open item is `minor`. One
  open `critical` item forces `fail`.
- **A `conditional_pass` needs an `acceptances` record tied to that exact
  `fat_sat_records.id`** — not just "the stage has an acceptance somewhere."
  **If the record is later superseded by a retest, its acceptance no
  longer counts** — the new record needs its own fresh acceptance. This
  closes the gap where a stale acceptance could appear to cover a revised
  report.

### 3.4 Explicit acceptance vs. ordinary comments — and whose acceptance counts

Acceptance is a deliberate, auditable action, tied to the specific record
it covers:

```
acceptances (id, order_stage_id,
             target_record_type[fat_sat_record|training_record|engineer_report],
             target_record_id,
             type[fat_conditional|sat_result|training_ack|handover_confirmation],
             accepted_by_type[customer|sales_manager],
             accepted_by_user_id,
             customer_authorization_evidence_document_id,  -- required if a
                                                             -- Sales Manager
                                                             -- accepts on
                                                             -- the customer's
                                                             -- behalf, below
             constitutes_customer_acceptance,  -- boolean, see rule below
             conditions_notes, accepted_at)
```

**BLI's internal approval to proceed is not the same thing as the
customer's acceptance.** Both reviews flagged this as the sharpest gap in
v3, and the fix distinguishes two stages by risk:

- **FAT conditional-pass** — a pre-shipment, BLI-internal commercial risk
  call (the customer usually isn't engaged yet). Either the **Sales
  Manager or the customer** may record it, and either one sets
  `constitutes_customer_acceptance` appropriately — no extra evidence
  needed, since it's not yet a customer-facing sign-off.
- **SAT and Handover** — these happen at the customer's site, the customer
  is present, and this is exactly the sign-off this system exists to make
  unambiguous. **`constitutes_customer_acceptance` must be true before the
  stage can complete.** That's satisfied by:
  - the customer's own login recording the acceptance directly, or
  - a Sales Manager recording it **with `customer_authorization_evidence_document_id`
    set** — a reference to something showing the customer actually agreed
    (an email, a signed note) — not a bare internal say-so.
  A Sales Manager acceptance *without* that evidence is stored (so the
  decision to proceed isn't lost) but **does not satisfy stage
  completion** — it only records that BLI chose to proceed at its own
  risk, and it auto-notifies the Company Owner, since that's a real
  liability call, not a routine one.

`acceptances` rows are append-only.

## 4. Stage-specific detail & deadline alerts

### 4.1 Target dates, change history, and who may approve a change

```
order_stages (id, order_id, stage_id, status,
              original_planned_start, original_planned_end,  -- immutable
              planned_start, planned_end,                     -- current, mutable
              actual_start, actual_end, updated_by, notes)

commitment_changes (id, order_id, order_stage_id, field_name,
                     old_value, new_value, reason, changed_by,
                     approved_by,          -- see rule below
                     customer_informed, changed_at)
```

The PC sets dates by hand (lead times vary too much for a template) and can
freely log **internal replanning** (buffer adjustments never communicated
to the customer) with just `changed_by`. But **any change to
`target_handover_date`, or to a stage date that's already been communicated
to the customer (`customer_informed` was true on its original entry),
requires `approved_by` to be a Sales Manager or Company Owner** — a PC
can't silently push out a commitment the customer already has in writing.

### 4.2 Manufacturing progress (stage 3) — milestone checklist

```
manufacturing_milestones (id, order_stage_id, name, sequence,
                           planned_date, actual_date,
                           status[pending|done], notes)
```

Per-order checklist; **stage 3 cannot move to `in_progress` with zero
milestone rows** — an empty checklist isn't a valid plan.

### 4.3 Engineer-submitted evidence: installation, SAT, training, handover

```
engineer_reports  (id, order_stage_id, type[installation|handover_readiness],
                    completed_by, completion_status[complete|incomplete],
                    outstanding_issues, report_document_id, notes, submitted_at)

fat_sat_records   (id, order_stage_id, type[FAT|SAT], scheduled_date,
                    actual_date, result[pass|fail|conditional_pass],
                    superseded_by, report_document_id, notes)

punch_list_items  (id, fat_sat_record_id, description, severity[critical|minor],
                    assigned_to, target_resolution_date,
                    raised_by, status[open|resolved],
                    resolved_at, resolved_by, verified_by, verified_at,
                    carries_past_handover)

training_records  (id, order_stage_id, scheduled_date, actual_date,
                    attendees, materials_provided, report_document_id, notes)
```

**Completion must mean actually finished, not just reported**:
`engineer_reports.completion_status` requires an explicit
`complete`/`incomplete` call from the Engineer, with `outstanding_issues`
describing anything not done — a report full of photos isn't itself proof
of completion if the Engineer hasn't affirmatively said so.

### 4.4 Deadline & at-risk alerts — continuous, not one-shot

A daily cron (`check_stage_deadlines.php`) evaluates **every non-completed
`order_stage`** (including ones already `delayed` or `blocked` — earlier
drafts wrongly stopped monitoring those once flagged):

- **Early warning** — `planned_end` within **3 days** (configurable by
  Company Owner, §7.1) and not finished → "at risk" notification.
- **Overdue** — `planned_end` passed and not `completed` → status
  `delayed`, and the notification **repeats daily with the current
  days-overdue count**, not just once on the initial transition.

Recipients: the order's PC, its Sales Manager, and every Company Owner.
Same logic runs against `target_handover_date`.

### 4.5 Blocked work — monitored on two tracks, both kept visible

A `blocked` stage stays in the deadline scan above (its delay keeps
accruing) **and** gets its own blocker record:

```
blockers (id, order_stage_id, description,
          responsible_party[bli_internal|supplier|customer|third_party],
          responsible_party_detail,
          next_action, next_review_date, raised_at, raised_by,
          resolved_at, resolved_by)
```

`description`, `responsible_party`, `next_action`, `next_review_date` are
required when a stage goes `blocked`. The UI shows both the overdue count
*and* the blocker together — a blocked stage is never quietly hidden behind
a different status. Escalates to Sales Manager + Company Owner if
`next_review_date` passes unactioned, or the blocker's been open **7
days**.

`responsible_party` is a constrained enum specifically so portfolio
advisory (§10) can attribute delay fairly — it is never inferred from who
typed the entry (`raised_by`/`changed_by` just record authorship, not
fault).

## 5. Post-handover service module

```
amc_contracts    (id, order_id, start_date, end_date, frequency,
                   coverage_terms, notes)

amc_visits       (id, amc_contract_id, scheduled_date, actual_date,
                   assigned_engineer_id, notes)

service_tickets  (id, order_id, type[warranty_claim|amc_visit|complaint|other],
                   severity, response_target_hours, resolution_target_hours,
                   opened_by, assigned_engineer_id,
                   status[open|in_progress|resolved|closed],
                   closure_type[customer_confirmed|auto_closed_no_response],
                   description, resolution_notes,
                   opened_at, first_response_at,
                   resolved_at, resolved_by, closed_at, closed_by)
```

**Warranty dates follow the contract, not a fixed rule**:
`orders.warranty_start_trigger` (set at planning from the agreed terms)
picks which stage's `actual_end` computes `warranty_start_date` —
shipment, installation, SAT, or handover — rather than always assuming
handover.

**Service timing is defined, not vague:**
- `first_response_at` marks when someone actually responded (distinct from
  `resolved_at`); `response_target_hours` and `resolution_target_hours`
  are tracked separately.
- SLA clocks run in **business hours** (Mon–Sat, 9am–6pm PKT by default,
  configurable by the Company Owner, §7.1), not calendar hours — checked
  by a separate **hourly** cron (`check_ticket_sla.php`), since a daily
  scan can't catch an hour-level SLA breach in time.
- **`resolved` ≠ `closed`.** `resolved` = the Engineer applied a fix.
  `closed` requires a `closure_type`: `customer_confirmed` (the customer
  said so) or `auto_closed_no_response` (an automatic close after **5
  business days** of silence following `resolved` — recorded explicitly as
  unconfirmed, never presented as if the customer agreed).

Customers raise tickets via their project login (comment mechanism, routed
to a queue). Company Owners see open/overdue tickets and AMC visits due,
portfolio-wide. Engineers manage all of this directly — no PC hand-off.

## 6. Comment & document scoping — internal, customer, per-supplier

```
comments  (id, project_id, order_id, order_stage_id,
           channel[internal|customer|supplier],
           shared_with_supplier_id,  -- required when project_id is set,
                                       -- order_id is null, and channel=supplier
           user_id, message, created_at)

documents (id, project_id, order_id, order_stage_id, type, file_path,
           uploaded_by, visibility[internal|supplier|customer|shared],
           shared_with_supplier_id)  -- same rule as comments, above
```

Order-level items are already isolated (an order has exactly one
`supplier_id`). The gap was **project-level** shared items on a
multi-supplier project — a document attached to the whole deal, marked
"visible to supplier," could otherwise leak one supplier's information to
another supplier on the same project. `shared_with_supplier_id` closes
that: a project-level supplier-visible item must name the one supplier
company it's shared with. A customer never sees the `supplier` channel or
vice versa.

**Supplier visibility is enforced by field, not just by "not commercial
terms":** a supplier-facing read never includes `orders.contract_value`,
`orders.currency`, `customer_name`/`customer_contact`, or any document/
comment tagged for `internal` or `customer` only.

## 7. Roles & permissions

| Role | Assigned how | Scope |
|------|--------------|-------|
| **Company Owner** | One login per person; role-based | Full visibility across the whole portfolio; who's assigned where; every alert and AI advisory at portfolio scope; account administration (§7.1); system settings (SLA windows, escalation thresholds). No project data entry. |
| **Sales Manager** | One login per person; `projects.sales_manager_id` | Primary accountable custodian of the project. Full read visibility on every order in it; directs the PC; acceptance authority (§3.4), with the SAT/handover evidence requirement above; approves `stage_exceptions`, order hold/cancel, and customer-facing date changes. |
| **Project Coordinator** | One login per person; `projects.project_coordinator_id`, overridable per order | Sole writer of `order_stages.status`. Records completion from Engineer evidence for 9–12. Logs internal (non-customer-facing) date replanning directly; customer-facing changes need Sales Manager/Owner approval. |
| **Import Manager** | One login per person; global advisory | Read access to all orders; comments on stages 6–8 jointly with PC/Sales Manager only when asked. No edit rights anywhere. |
| **Installation & Service Engineer** | One login per person; `orders.installation_engineer_id` | Direct read/write on the stage 9–12 evidence tables (`engineer_reports`, `fat_sat_records`/SAT, `training_records`) for assigned orders — not `order_stages.status` itself. Manages `service_tickets`/`amc_contracts`/`amc_visits` directly post-handover. |
| **Supplier** (external) | One login per supplier company | Comment (`supplier` channel) + view on stages 3–6 across every order linked to that supplier. No commercial fields (§6). |
| **Customer** (external) | One login per project | Comment (`customer` channel) across every order in their project. Acceptance authority on FAT-conditional/SAT/training/handover — **the only party whose acceptance always satisfies SAT/handover completion without extra evidence** (§3.4). Can raise service tickets. |

Authorization, server-side, never from a client-supplied id:
- Company Owner / Import Manager → role check only.
- Sales Manager → `order.project.sales_manager_id` = requester.
- Project Coordinator → `order.project_coordinator_id` = requester, or
  falls back to `order.project.project_coordinator_id`.
- Engineer → `order.installation_engineer_id` = requester.
- Supplier → `order.supplier_id` = requester's `supplier_id`.
- Customer → `order.project_id` = requester's `scope_project_id`.

### 7.1 Account administration & system settings

Company Owner handles account administration (create/deactivate logins,
reset passwords, role/project assignments — separate from project data
entry) **and** the configurable thresholds referenced throughout this doc:
the 3-day early-warning window, the 7-day blocker escalation, SLA business
hours, and the 5-business-day auto-close window.

### 7.2 Staff absence & reassignment

```
assignment_history (id, project_id, order_id, role,
                     previous_user_id, new_user_id,
                     reason[temporary_cover|permanent_reassignment],
                     cover_end_date, changed_by, changed_at)
```

Never a silent overwrite. Temporary cover sets `cover_end_date`; past that
date the system prompts for revert-or-confirm. Blockers, comments, and
history stay attached to the project/order, not the person.

## 8. Import & delivery coordination detail

```
customer_import_tracking (id, order_stage_id,  -- one row for stage 7,
                                                 -- one for stage 8 — not
                                                 -- shared, since each has
                                                 -- its own document chase
                           customer_contact_name, customer_contact_email,
                           customer_contact_phone, latest_status,
                           outstanding_documents, expected_date,
                           next_follow_up_date,
                           import_manager_engaged_at,
                           import_manager_disengaged_at, notes)

customer_import_tracking_updates (id, customer_import_tracking_id,
                                   status, note, reported_at, recorded_by)
```

Splitting per stage (not one row for both 7 and 8) avoids collapsing two
independent document chases into one lossy `notes` field, and the
`_updates` child table preserves history instead of overwriting
`latest_status` in place each time. `import_manager_engaged_at`/
`disengaged_at` record exactly when the Import Manager's advisory
involvement started and ended.

## 9. Core data model (consolidated)

```
projects           (id, project_number, customer_name, customer_contact, title,
                    sales_manager_id, project_coordinator_id, status, created_by)

suppliers          (id, name, contact_email, contact_phone)

users              (id, name, email, password_hash, role, status,
                    scope_project_id, supplier_id)

orders             (id, project_id, order_number, machine_name, machine_spec,
                    supplier_id, contract_value, currency, start_date,
                    target_handover_date, status, project_coordinator_id,
                    installation_engineer_id, warranty_start_trigger,
                    warranty_start_date, warranty_end_date, created_by)

order_status_changes (id, order_id, old_status, new_status, reason,
                    changed_by, changed_at)

requirements       (id, order_id, description, document_ref, version,
                    approved_by, approved_at)

stages             (id, name, sequence)

order_stages       (id, order_id, stage_id, status,
                    original_planned_start, original_planned_end,
                    planned_start, planned_end, actual_start, actual_end,
                    updated_by, notes)

commitment_changes (id, order_id, order_stage_id, field_name, old_value,
                    new_value, reason, changed_by, approved_by,
                    customer_informed, changed_at)

stage_exceptions   (id, order_stage_id, prerequisite_stage_id, applies_to,
                    reason, approved_by, approved_at)

manufacturing_milestones (id, order_stage_id, name, sequence,
                    planned_date, actual_date, status, notes)

engineer_reports   (id, order_stage_id, type, completed_by,
                    completion_status, outstanding_issues,
                    report_document_id, notes, submitted_at)

fat_sat_records    (id, order_stage_id, type, scheduled_date, actual_date,
                    result, superseded_by, report_document_id, notes)

punch_list_items   (id, fat_sat_record_id, description, severity,
                    assigned_to, target_resolution_date, raised_by,
                    status, resolved_at, resolved_by, verified_by,
                    verified_at, carries_past_handover)

training_records   (id, order_stage_id, scheduled_date, actual_date,
                    attendees, materials_provided, report_document_id, notes)

acceptances        (id, order_stage_id, target_record_type, target_record_id,
                    type, accepted_by_type, accepted_by_user_id,
                    customer_authorization_evidence_document_id,
                    constitutes_customer_acceptance, conditions_notes,
                    accepted_at)

blockers           (id, order_stage_id, description, responsible_party,
                    responsible_party_detail, next_action, next_review_date,
                    raised_at, raised_by, resolved_at, resolved_by)

documents          (id, project_id, order_id, order_stage_id, type,
                    file_path, uploaded_by, visibility,
                    shared_with_supplier_id)

shipments          (id, order_id, carrier, mode, port_of_loading,
                    port_of_discharge, bl_awb_number, etd, eta,
                    actual_dispatch_date, customs_status, notes)

customer_import_tracking (id, order_stage_id, customer_contact_name,
                    customer_contact_email, customer_contact_phone,
                    latest_status, outstanding_documents, expected_date,
                    next_follow_up_date, import_manager_engaged_at,
                    import_manager_disengaged_at, notes)

customer_import_tracking_updates (id, customer_import_tracking_id,
                    status, note, reported_at, recorded_by)

comments           (id, project_id, order_id, order_stage_id, channel,
                    shared_with_supplier_id, user_id, message, created_at)

amc_contracts      (id, order_id, start_date, end_date, frequency,
                    coverage_terms, notes)

amc_visits         (id, amc_contract_id, scheduled_date, actual_date,
                    assigned_engineer_id, notes)

service_tickets    (id, order_id, type, severity, response_target_hours,
                    resolution_target_hours, opened_by, assigned_engineer_id,
                    status, closure_type, description, resolution_notes,
                    opened_at, first_response_at, resolved_at, resolved_by,
                    closed_at, closed_by)

assignment_history (id, project_id, order_id, role, previous_user_id,
                    new_user_id, reason, cover_end_date, changed_by, changed_at)

activity_log       (id, order_id, entity_type, entity_id, action,
                    old_value, new_value, user_id, created_at)
                    -- generic audit trail for lower-stakes mutable writes
                    -- (order_stages status transitions, milestone edits);
                    -- commitment_changes and assignment_history exist
                    -- separately because they need extra fields
                    -- (reason, approver) this generic log doesn't carry

notifications      (id, user_id, order_id, type, message, read_at, created_at)

ai_reports         (id, order_id, type, provider, prompt, response,
                    status[new|acknowledged|dismissed|actioned],
                    acknowledged_by, acknowledged_at, action_notes,
                    created_by, created_at)
```

`documents.visibility`/`shared_with_supplier_id` and `comments.channel`/
`shared_with_supplier_id` are enforced on every read, never trusting the
client.

**Deferred, not built:** BLI confirmed no payment/value tracking is needed.
`contract_value`/`currency` stay as static reference fields only.

## 10. AI integration layer

```
AiAdvisorService
├── ClaudeAdapter
├── GeminiAdapter
└── ChatGptAdapter
```

Use cases: **status reports** (Sales Manager's per-project dashboard,
Company Owner's portfolio roll-up); **risk advisory** per order (Sales
Manager + PC + Owner); **portfolio advisory** (Owner only) for
cross-project patterns; **follow-up drafting** on the correct comment
channel; **monitoring digest** (daily, portfolio-wide to Owners, per
project to its Sales Manager/PC).

Every AI output is logged in `ai_reports` with an
acknowledge/dismiss/action lifecycle — advisory only, never
auto-executed. **Portfolio advisory attributes by `blockers.responsible_party`
and `commitment_changes` context — never by raw overdue counts or by who
typed an entry** — a PC whose delays trace to the customer's import team or
a supplier's slip isn't scored the same as one whose delays trace to their
own inaction.

Rules: API keys server-side only, never sent to the frontend or accessible
to external sessions. **The scope filter (which orders/data a user may see)
is enforced inside the data-gathering function that assembles the AI
prompt, not left to the caller** — a prompt built by joining several
tables must never accidentally include another customer's row because one
join forgot the filter. On-demand or scheduled batch only, never per page
load.

## 11. Tech stack

### 11.1 UX principle (standing requirement, applies to every screen)

The system has seven very different audiences — a Company Owner scanning a
portfolio, a Sales Manager triaging risk, a PC doing detailed data entry
all day, an Engineer filling forms on-site (often on a phone/tablet), and
external Customers/Suppliers who never received training on this tool.
**The UI must be friendly, attractive, and designed around how each of
these people actually works — not one generic admin-panel skin reused
seven times.** Concretely:

- Each role's home view leads with what that role needs first (Owner:
  portfolio risk; Sales Manager: their projects' status; PC: today's
  actions; Engineer: their assigned site visit's forms; Customer/Supplier:
  their project's progress) — not a generic table dump.
- Forms the Engineer fills on-site (installation report, FAT/SAT,
  training) must work well on a phone/tablet, with large touch targets —
  this is real field-use, not just desktop office work.
- External-facing screens (Customer/Supplier) must be self-explanatory
  with zero onboarding — they use this rarely and were never trained on
  it, unlike internal staff.
- Consistent visual language (color, iconography) so status at a glance is
  immediately readable — e.g., risk/delay states use the same color logic
  everywhere, never ambiguous or purely textual.
- This is a design requirement, not a nice-to-have to defer — build it in
  from Phase 1's first screen, not retrofitted later.

- **Backend**: PHP 8 + PDO/MySQL, REST API (JSON) — Bluehost shared
  hosting compatible, consistent with the team's other project.
- **Frontend**: SPA (Vue or React), static build, role-based app shells.
- **Auth**: JWT (short-lived access + refresh), `password_hash()`.
- **File storage**: outside the public web root, served only through an
  authenticated endpoint checking scope on every request.
- **Email**: PHPMailer via Bluehost SMTP.
- **Scheduling**: two cron jobs, not one — `check_stage_deadlines.php`
  (daily: stage/blocker deadlines, §4.4–4.5) and `check_ticket_sla.php`
  (**hourly**: service-ticket response/resolution SLA and auto-close,
  §5) — a hopeful daily-only design was the reviews' top infrastructure
  finding, since an hour-level SLA can't be caught by a once-a-day scan.

## 12. Security notes

- Force HTTPS.
- Every external-facing endpoint re-checks the requester's actual scope
  server-side on every request.
- Login rate-limiting/lockout on externally exposed portals.
- `acceptances`, `commitment_changes`, `assignment_history`, and
  `customer_import_tracking_updates` are **append-only** — the audit trail
  for contractual commitments, sign-offs, and accountability.
- Regular DB backups — this is the system of record for SAT sign-off,
  handover, and service history.
