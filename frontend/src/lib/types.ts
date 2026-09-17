export type Role =
  | 'company_owner'
  | 'sales_manager'
  | 'project_coordinator'
  | 'import_manager'
  | 'installation_engineer'
  | 'supplier'
  | 'customer'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  status: 'active' | 'inactive'
  scope_project_id: number | null
  supplier_id: number | null
}

export type StageStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'blocked'

export interface OrderStage {
  id: number
  order_id: number
  stage_id: number
  stage_name: string
  sequence: number
  status: StageStatus
  original_planned_start: string | null
  original_planned_end: string | null
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  notes: string | null
}

export type OrderStatus = 'active' | 'on_hold' | 'cancelled' | 'completed'

export interface Order {
  id: number
  project_id: number
  order_number: string
  machine_name: string
  machine_spec: string | null
  supplier_id: number
  status: OrderStatus
  start_date: string
  target_handover_date: string
  project_coordinator_id: number | null
  installation_engineer_id: number
}

export interface Project {
  id: number
  project_number: string
  customer_name: string
  customer_contact: string | null
  title: string
  sales_manager_id: number
  project_coordinator_id: number
  status: 'active' | 'completed'
}
