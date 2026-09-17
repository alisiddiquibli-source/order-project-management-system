# Order & Project Lifecycle Management System

A system to plan, execute and monitor customer projects end-to-end. **A
Project is one customer deal; an Order is exactly one physical machine**
(never a quantity field standing in for several — each machine gets its own
FAT/SAT/installation/acceptance) — a project can hold several orders, each
running its own pipeline independently:
requirements → ordering → machine manufacturing progress at the supplier's
site → machine testing material coordination → machine FAT readiness →
shipment coordination → import clearance in Pakistan → delivery →
installation → SAT → training → handover → post-handover service/AMC.

Built for the internal team: **Company Owner** — full visibility across the
entire portfolio, every project, who's running it, and AI-backed advisories
right on their dashboard; **Sales Manager** — the accountable custodian of
each of their own projects, same full visibility and AI advisories, scoped
to their book of work, directing the **Project Coordinator** who does the
actual data entry; plus Import Manager and Installation & Service Engineer.
BLI has several people in each role, and each person gets one login
covering every project assigned to them. External logins **cannot edit
pipeline progress**, but they do comment, raise service tickets, and
record authorized acceptances (the customer's sign-off on SAT and
handover is a real, required action, not a formality): one login per
project for the **customer**, and one login per **supplier** company
covering all of that supplier's projects with BLI.

## Structure

```
order-project-management-system/
├── docs/
│   ├── ARCHITECTURE.md   System design: entities, workflow stages, roles, AI layer
│   └── ROADMAP.md        Phased build plan
├── backend/              PHP 8 + PDO/MySQL REST API (to be scaffolded)
└── frontend/             Web app (to be scaffolded)
```

## Hosting

Bluehost shared/business hosting (cPanel), PHP + MySQL — consistent with the
team's existing housekeeping-system deployment.

## Where to start

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design, and
[docs/ROADMAP.md](docs/ROADMAP.md) for build order and current phase.
