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
  customer_name?: string
  customer_contact?: string | null
  title: string
  sales_manager_id: number
  project_coordinator_id: number
  status: 'active' | 'completed'
}

export type CommentChannel = 'internal' | 'customer' | 'supplier'

export interface Comment {
  id: number
  project_id: number | null
  order_id: number | null
  order_stage_id: number | null
  channel: CommentChannel
  shared_with_supplier_id: number | null
  user_id: number
  user_name: string
  message: string
  created_at: string
}

export type TicketSeverity = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface ServiceTicket {
  id: number
  order_id: number
  type: 'warranty_claim' | 'amc_visit' | 'complaint' | 'other'
  severity: TicketSeverity
  response_target_hours: number
  resolution_target_hours: number
  opened_by: number
  assigned_engineer_id: number | null
  status: TicketStatus
  closure_type: 'customer_confirmed' | 'auto_closed_no_response' | null
  description: string
  resolution_notes: string | null
  opened_at: string
  first_response_at: string | null
  resolved_at: string | null
  closed_at: string | null
}

export interface AmcContract {
  id: number
  order_id: number
  start_date: string
  end_date: string
  frequency: 'quarterly' | 'biannual' | 'annual'
  coverage_terms: string | null
  notes: string | null
}

export interface AmcVisit {
  id: number
  amc_contract_id: number
  scheduled_date: string
  actual_date: string | null
  assigned_engineer_id: number
  notes: string | null
  order_id?: number
  order_number?: string
  machine_name?: string
}
