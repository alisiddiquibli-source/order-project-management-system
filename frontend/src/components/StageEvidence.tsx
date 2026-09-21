import { useState } from 'react'
import { AcceptanceSection } from './AcceptanceSection'
import { DocumentsSection } from './DocumentsSection'
import { EngineerReportSection } from './EngineerReportSection'
import { FatSatSection } from './FatSatSection'
import { ImportTrackingSection } from './ImportTrackingSection'
import { MilestonesSection } from './MilestonesSection'
import { RequirementsSection } from './RequirementsSection'
import { ShipmentSection } from './ShipmentSection'
import { TrainingSection } from './TrainingSection'
import { UrsExemptionPanel } from './UrsExemptionPanel'
import type { OrderStage } from '../lib/types'

/**
 * Dispatches to the right evidence sub-form(s) for a stage
 * (docs/ARCHITECTURE.md §3.1/§3.2 — this mirrors StageCompletionEvaluator's
 * per-stage evidence checks, so what's shown here is exactly what the
 * server will actually gate completion on). Stage 4 has no dedicated
 * sub-form: it's satisfied by the PC note already on the stage (see
 * StageUpdateForm).
 */
export function StageEvidence({ orderId, stage }: { orderId: number; stage: OrderStage }) {
  const orderStageId = stage.id
  const stageId = stage.stage_id
  // Bumped when a stage's DocumentsSection uploads a report/photo, so the
  // sibling FatSatSection's report-document picker (a separate fetch)
  // picks it up without needing a page reload.
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0)

  switch (stageId) {
    case 1:
      return (
        <div className="space-y-3">
          <RequirementsSection orderId={orderId} />
          <DocumentsSection
            orderId={orderId}
            orderStageId={orderStageId}
            suggestedType="URS"
            title="Documents (URS required — also add drawings/layouts here)"
            onUploaded={() => setDocumentsRefreshKey((k) => k + 1)}
          />
          <UrsExemptionPanel orderId={orderId} orderStageId={orderStageId} refreshKey={documentsRefreshKey} />
        </div>
      )
    case 2:
      return (
        <div className="space-y-3">
          <DocumentsSection orderId={orderId} orderStageId={orderStageId} suggestedType="PO" title="Documents (a PO is required)" />
          <DocumentsSection orderId={orderId} orderStageId={orderStageId} suggestedType="LC" title="Documents (an LC is required)" />
        </div>
      )
    case 3:
      return <MilestonesSection orderId={orderId} orderStageId={orderStageId} />
    case 5:
      return (
        <div className="space-y-3">
          <FatSatSection orderId={orderId} orderStageId={orderStageId} stageId={stageId} type="FAT" documentsRefreshKey={documentsRefreshKey} />
          <DocumentsSection
            orderId={orderId}
            orderStageId={orderStageId}
            suggestedType="fat_report"
            title="FAT report & photos"
            onUploaded={() => setDocumentsRefreshKey((k) => k + 1)}
          />
          <DocumentsSection orderId={orderId} orderStageId={orderStageId} suggestedType="IQ" title="IQ document (from Supplier)" />
          <DocumentsSection orderId={orderId} orderStageId={orderStageId} suggestedType="OQ" title="OQ document (from Supplier)" />
          <DocumentsSection orderId={orderId} orderStageId={orderStageId} suggestedType="DQ" title="DQ document (from Supplier)" />
          <AcceptanceSection orderId={orderId} orderStageId={orderStageId} stageId={stageId} type="fat_conditional" targetTable="fat_sat_record" />
        </div>
      )
    case 6:
      return (
        <div className="space-y-3">
          <ShipmentSection orderId={orderId} />
          <DocumentsSection
            orderId={orderId}
            orderStageId={orderStageId}
            suggestedType="shipping_document"
            title="Shipping documents (e.g. Bill of Lading)"
          />
        </div>
      )
    case 7:
      return <ImportTrackingSection orderId={orderId} stageId={stageId} />
    case 8:
      return (
        <div className="space-y-3">
          <ImportTrackingSection orderId={orderId} stageId={stageId} />
          <DocumentsSection orderId={orderId} orderStageId={orderStageId} suggestedType="delivery_note" title="Delivery documents" />
        </div>
      )
    case 9:
      return <EngineerReportSection orderId={orderId} stageId={stageId} type="installation" title="Installation report" />
    case 10:
      return (
        <div className="space-y-3">
          <FatSatSection orderId={orderId} orderStageId={orderStageId} stageId={stageId} type="SAT" documentsRefreshKey={documentsRefreshKey} />
          <DocumentsSection
            orderId={orderId}
            orderStageId={orderStageId}
            suggestedType="sat_report"
            title="SAT report & photos"
            onUploaded={() => setDocumentsRefreshKey((k) => k + 1)}
          />
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
