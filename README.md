# Order & Project Lifecycle Management System

A system to plan, execute and monitor equipment/project orders end-to-end:
requirements → ordering → import & manufacturing at the supplier's site →
testing material supply → FAT → shipment coordination → import clearance in
Pakistan → delivery → installation → SAT → training → handover.

Built for internal team use, with limited external logins for **suppliers**
(to update manufacturing/FAT progress) and **customers** (to view their own
order's progress and sign off on SAT).

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
