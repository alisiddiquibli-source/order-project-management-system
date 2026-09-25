export type Role =
  | 'company_owner'
  | 'sales_manager'
  | 'project_coordinator'
  | 'import_manager'
  | 'installation_engineer'
  | 'hr_manager'
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
  // Resolved names — who's actually responsible for this order. Sales
  // Manager comes from the parent project; effective_project_coordinator_id
  // /project_coordinator_name already account for the order-level override
  // falling back to the project's default PC when null.
  sales_manager_id: number
  sales_manager_name: string | null
  effective_project_coordinator_id: number | null
  project_coordinator_name: string | null
  installation_engineer_name: string | null
  supplier_name: string | null
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
  picture: string | null
}

export interface Supplier {
  id: number
  name: string
  contact_email: string | null
  contact_phone: string | null
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

export interface UrsExemption {
  id: number
  order_id: number
  reason: string
  approved_by: number
  approved_at: string
}

export interface TrainingAttendee {
  id: number
  training_record_id: number
  name: string
  department: string | null
  designation: string | null
  phone: string | null
  email: string | null
}

export interface Requirement {
  id: number
  order_id: number
  description: string
  document_ref: string | null
  version: number
  approved_by: number | null
  approved_at: string | null
  created_at: string
}

export type DocumentVisibility = 'internal' | 'supplier' | 'customer' | 'shared'

export interface DocumentRecord {
  id: number
  project_id: number | null
  order_id: number | null
  order_stage_id: number | null
  fat_sat_record_id: number | null
  type: string
  storage_type: 'local' | 'google_drive' | 'link'
  file_path: string
  uploaded_by: number
  visibility: DocumentVisibility
  shared_with_supplier_id: number | null
  created_at: string
}

export interface ManufacturingMilestone {
  id: number
  order_stage_id: number
  name: string
  sequence: number
  planned_date: string | null
  actual_date: string | null
  status: 'pending' | 'done'
  notes: string | null
}

export type FatSatType = 'FAT' | 'SAT'
export type FatSatResult = 'pass' | 'fail' | 'conditional_pass'

export interface FatSatRecord {
  id: number
  order_stage_id: number
  type: FatSatType
  scheduled_date: string | null
  actual_date: string | null
  result: FatSatResult | null
  superseded_by: number | null
  report_document_id: number | null
  notes: string | null
}

export interface PunchListItem {
  id: number
  fat_sat_record_id: number
  description: string
  severity: 'critical' | 'minor'
  assigned_to: number | null
  target_resolution_date: string | null
  raised_by: number
  status: 'open' | 'resolved'
  resolved_at: string | null
  verified_by: number | null
  verified_at: string | null
  carries_past_handover: boolean
}

export type EngineerReportType = 'installation' | 'handover_readiness'

export interface EngineerReport {
  id: number
  order_stage_id: number
  type: EngineerReportType
  completed_by: number
  completion_status: 'complete' | 'incomplete'
  outstanding_issues: string | null
  report_document_id: number | null
  notes: string | null
  submitted_at: string
}

export interface TrainingRecord {
  id: number
  order_stage_id: number
  scheduled_date: string | null
  actual_date: string | null
  attendees: string | null
  materials_provided: string | null
  report_document_id: number | null
  notes: string | null
}

export type AcceptanceType = 'fat_conditional' | 'sat_result' | 'training_ack' | 'handover_confirmation'
export type AcceptanceTargetTable = 'fat_sat_record' | 'training_record' | 'engineer_report'

export interface Acceptance {
  id: number
  order_stage_id: number
  target_record_type: AcceptanceTargetTable
  target_record_id: number
  type: AcceptanceType
  accepted_by_type: 'customer' | 'sales_manager'
  accepted_by_user_id: number
  customer_authorization_evidence_document_id: number | null
  constitutes_customer_acceptance: boolean
  conditions_notes: string | null
  accepted_at: string
}

export type AiReportType = 'order_risk_advisory' | 'project_status_report' | 'portfolio_advisory' | 'follow_up_draft' | 'daily_digest'
export type AiReportStatus = 'new' | 'acknowledged' | 'dismissed' | 'actioned'

export interface AiReport {
  id: number
  order_id: number | null
  project_id: number | null
  type: AiReportType
  provider: 'claude' | 'gemini' | 'chatgpt'
  prompt: string
  response: string
  status: AiReportStatus
  acknowledged_by: number | null
  acknowledged_at: string | null
  action_notes: string | null
  created_by: number | null
  created_at: string
}

export interface Shipment {
  id: number
  order_id: number
  carrier: string | null
  mode: 'sea' | 'air' | 'road' | null
  port_of_loading: string | null
  port_of_discharge: string | null
  bl_awb_number: string | null
  etd: string | null
  eta: string | null
  actual_dispatch_date: string | null
  customs_status: string | null
  notes: string | null
}

export interface CustomerImportTrackingUpdate {
  id: number
  customer_import_tracking_id: number
  status: string
  note: string | null
  reported_at: string
  recorded_by: number
}

export interface CustomerImportTracking {
  id: number
  order_stage_id: number
  customer_contact_name: string | null
  customer_contact_email: string | null
  customer_contact_phone: string | null
  latest_status: string | null
  outstanding_documents: string | null
  expected_date: string | null
  next_follow_up_date: string | null
  import_manager_engaged_at: string | null
  import_manager_disengaged_at: string | null
  notes: string | null
  history?: CustomerImportTrackingUpdate[]
}
