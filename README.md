# Order & Project Lifecycle Management System

A system to plan, execute and monitor equipment/project orders end-to-end:
requirements → ordering → machine manufacturing progress at the supplier's
site → machine testing material coordination → machine FAT readiness →
shipment coordination → import clearance in Pakistan → delivery →
installation → SAT → training → handover → post-handover service/AMC.

Built for the internal team (Company Owner, **Sales Manager** — the
accountable custodian of each project, with full visibility and AI-backed
advisories on their dashboard, directing the Project Coordinator who does
the actual data entry — Import Manager, Installation & Service Engineer).
BLI has several people in each role, and each person gets one login
covering every project assigned to them. External access is
observer-plus-comment only, no data entry: one login per project for the
**customer**, and one login per **supplier** company covering all of that
supplier's projects with BLI.

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
