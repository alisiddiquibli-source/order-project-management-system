import { AcceptanceSection } from './AcceptanceSection'
import { DocumentsSection } from './DocumentsSection'
import { EngineerReportSection } from './EngineerReportSection'
import { FatSatSection } from './FatSatSection'
import { MilestonesSection } from './MilestonesSection'
import { RequirementsSection } from './RequirementsSection'
import { TrainingSection } from './TrainingSection'
import type { OrderStage } from '../lib/types'

/**
 * Dispatches to the right evidence sub-form(s) for a stage
 * (docs/ARCHITECTURE.md §3.1/§3.2 — this mirrors StageCompletionEvaluator's
 * per-stage evidence checks, so what's shown here is exactly what the
 * server will actually gate completion on). Stages 4, 6, and 7 have no
 * dedicated sub-form yet: 4 is satisfied by the PC note already on the
 * stage (see StageUpdateForm), 6/7 need a shipment/import-tracking UI
 * that hasn't been built (docs/ROADMAP.md).
 */
export function StageEvidence({ orderId, stage }: { orderId: number; stage: OrderStage }) {
  const orderStageId = stage.id
  const stageId = stage.stage_id

  switch (stageId) {
    case 1:
      return <RequirementsSection orderId={orderId} />
    case 2:
      return <DocumentsSection orderId={orderId} orderStageId={orderStageId} suggestedType="PO" title="Documents (a PO is required)" />
    case 3:
      return <MilestonesSection orderId={orderId} orderStageId={orderStageId} />
    case 5:
      return (
        <div className="space-y-3">
          <FatSatSection orderId={orderId} orderStageId={orderStageId} stageId={stageId} type="FAT" />
          <AcceptanceSection orderId={orderId} orderStageId={orderStageId} stageId={stageId} type="fat_conditional" targetTable="fat_sat_record" />
        </div>
      )
    case 8:
      return <DocumentsSection orderId={orderId} orderStageId={orderStageId} suggestedType="delivery_note" title="Delivery documents" />
    case 9:
      return <EngineerReportSection orderId={orderId} stageId={stageId} type="installation" title="Installation report" />
    case 10:
      return (
        <div className="space-y-3">
          <FatSatSection orderId={orderId} orderStageId={orderStageId} stageId={stageId} type="SAT" />
          <AcceptanceSection orderId={orderId} orderStageId={orderStageId} stageId={stageId} type="sat_result" targetTable="fat_sat_record" />
        </div>
      )
    case 11:
      return (
        <div className="space-y-3">
          <TrainingSection orderId={orderId} stageId={stageId} />
          <AcceptanceSection orderId={orderId} orderStageId={orderStageId} stageId={stageId} type="training_ack" targetTable="training_record" />
        </div>
      )
    case 12:
      return (
        <div className="space-y-3">
          <EngineerReportSection orderId={orderId} stageId={stageId} type="handover_readiness" title="Handover readiness report" />
          <DocumentsSection orderId={orderId} orderStageId={orderStageId} suggestedType="handover_certificate" title="Handover certificate" />
          <AcceptanceSection orderId={orderId} orderStageId={orderStageId} stageId={stageId} type="handover_confirmation" targetTable="engineer_report" />
        </div>
      )
    default:
      return null
  }
}
