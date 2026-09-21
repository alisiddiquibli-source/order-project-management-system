<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Domain\AcceptanceRules;
use Bli\Http\OrderAccess;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\AcceptanceRepository;
use Bli\Models\DocumentRepository;
use Bli\Models\EngineerReportRepository;
use Bli\Models\FatSatRepository;
use Bli\Models\ManufacturingMilestoneRepository;
use Bli\Models\ProjectRepository;
use Bli\Models\RequirementRepository;
use Bli\Models\TrainingAttendeeRepository;
use Bli\Models\TrainingRecordRepository;
use Bli\Models\UrsExemptionRepository;

/** @var \Bli\Http\Router $router */

// ---------------------------------------------------------------------
// Requirements (stage 1)
// ---------------------------------------------------------------------

$router->get('/api/orders/{id}/requirements', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    Response::json(RequirementRepository::listForOrder($orderId));
});

$router->post('/api/orders/{id}/requirements', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator']);

    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    $description = (string) ($request->body['description'] ?? '');
    if ($description === '') {
        Response::error('description is required.', 422);
    }

    $requirement = RequirementRepository::create($orderId, $description, $request->body['document_ref'] ?? null);
    Response::json($requirement, 201);
});

$router->patch('/api/requirements/{id}/approve', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['sales_manager', 'company_owner']);

    $requirement = RequirementRepository::find((int) $params['id']);
    if ($requirement === null) {
        Response::error('Requirement not found.', 404);
    }
    OrderAccess::requireVisibleOrder((int) $requirement['order_id'], $claims);

    Response::json(RequirementRepository::approve((int) $requirement['id'], (int) $claims['sub']));
});

// Stage 1 normally requires a URS document on file (StageCompletionEvaluator)
// — one Owner-only exemption per order, for when a customer genuinely has
// none to give (§ business rule dictated live, not in the original spec).
$router->get('/api/orders/{id}/urs-exemption', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    Response::json(UrsExemptionRepository::findForOrder($orderId));
});

$router->post('/api/orders/{id}/urs-exemption', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['company_owner']);

    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    $reason = (string) ($request->body['reason'] ?? '');
    if ($reason === '') {
        Response::error('reason is required.', 422);
    }
    if (UrsExemptionRepository::findForOrder($orderId) !== null) {
        Response::error('A URS exemption already exists for this order.', 422);
    }

    Response::json(UrsExemptionRepository::create($orderId, $reason, (int) $claims['sub']), 201);
});

// ---------------------------------------------------------------------
// Documents (stage 2's PO, FAT/SAT reports, handover certificate, and
// FAT/SAT photo/video via Google Drive — §4.3.1)
// ---------------------------------------------------------------------

$router->get('/api/orders/{id}/documents', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    Response::json(DocumentRepository::findForOrder($orderId, $claims));
});

$router->post('/api/orders/{id}/documents', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator', 'installation_engineer']);

    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    $type = (string) ($request->body['type'] ?? '');
    $storageType = (string) ($request->body['storage_type'] ?? 'local');
    if ($type === '' || !in_array($storageType, ['local', 'google_drive', 'link'], true)) {
        Response::error('type is required and storage_type must be local|google_drive|link.', 422);
    }

    if ($storageType === 'google_drive') {
        $filePath = (string) ($request->body['file_path'] ?? '');
        if ($filePath === '') {
            Response::error('file_path (the Google Drive file ID) is required for storage_type=google_drive.', 422);
        }
    } elseif ($storageType === 'link') {
        $filePath = (string) ($request->body['file_path'] ?? '');
        if (!filter_var($filePath, FILTER_VALIDATE_URL) || !str_starts_with($filePath, 'http')) {
            Response::error('file_path must be a valid http(s) URL for storage_type=link.', 422);
        }
    } else {
        $uploadError = $request->files['file']['error'] ?? UPLOAD_ERR_NO_FILE;
        if ($uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE) {
            Response::error('The file is too large for this server to accept.', 422);
        }
        if (!isset($request->files['file']) || $uploadError !== UPLOAD_ERR_OK) {
            Response::error('A file upload is required for storage_type=local.', 422);
        }
        try {
            $filePath = DocumentRepository::storeUploadedFile(
                $request->files['file']['tmp_name'],
                $request->files['file']['name'],
            );
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    $document = DocumentRepository::create([
        'order_id' => $orderId,
        'order_stage_id' => isset($request->body['order_stage_id']) ? (int) $request->body['order_stage_id'] : null,
        'fat_sat_record_id' => isset($request->body['fat_sat_record_id']) ? (int) $request->body['fat_sat_record_id'] : null,
        'type' => $type,
        'storage_type' => $storageType,
        'file_path' => $filePath,
        'visibility' => $request->body['visibility'] ?? 'internal',
        'shared_with_supplier_id' => isset($request->body['shared_with_supplier_id'])
            ? (int) $request->body['shared_with_supplier_id'] : null,
    ], (int) $claims['sub']);

    Response::json($document, 201);
});

// Project-level media (docs/ARCHITECTURE.md §4.3.1 extension): video and
// other files attached to a project as a whole rather than to one
// order/stage — e.g. a walkthrough video, site-survey photos. Same local
// storage + authenticated-download model as order documents.
$router->get('/api/projects/{id}/documents', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $projectId = (int) $params['id'];
    if (ProjectRepository::findByIdForUser($projectId, $claims) === null) {
        Response::error('Project not found.', 404);
    }

    Response::json(DocumentRepository::findForProject($projectId, $claims));
});

$router->post('/api/projects/{id}/documents', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator', 'installation_engineer', 'sales_manager', 'company_owner']);

    $projectId = (int) $params['id'];
    if (ProjectRepository::findByIdForUser($projectId, $claims) === null) {
        Response::error('Project not found.', 404);
    }

    $type = (string) ($request->body['type'] ?? '');
    if ($type === '') {
        Response::error('type is required.', 422);
    }

    $storageType = (string) ($request->body['storage_type'] ?? 'local');
    if (!in_array($storageType, ['local', 'link'], true)) {
        Response::error('storage_type must be local|link.', 422);
    }

    if ($storageType === 'link') {
        $filePath = (string) ($request->body['file_path'] ?? '');
        if (!filter_var($filePath, FILTER_VALIDATE_URL) || !str_starts_with($filePath, 'http')) {
            Response::error('file_path must be a valid http(s) URL for storage_type=link.', 422);
        }
    } else {
        $uploadError = $request->files['file']['error'] ?? UPLOAD_ERR_NO_FILE;
        if ($uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE) {
            Response::error('The file is too large for this server to accept.', 422);
        }
        if (!isset($request->files['file']) || $uploadError !== UPLOAD_ERR_OK) {
            Response::error('A file upload is required.', 422);
        }
        try {
            $filePath = DocumentRepository::storeUploadedFile(
                $request->files['file']['tmp_name'],
                $request->files['file']['name'],
            );
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    $document = DocumentRepository::create([
        'project_id' => $projectId,
        'type' => $type,
        'storage_type' => $storageType,
        'file_path' => $filePath,
        'visibility' => $request->body['visibility'] ?? 'internal',
    ], (int) $claims['sub']);

    Response::json($document, 201);
});

$router->get('/api/documents/{id}/file', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);

    $document = DocumentRepository::findByIdForUser((int) $params['id'], $claims);
    if ($document === null) {
        Response::error('Document not found.', 404);
    }
    // A project-level document has no order_id to check; an order-scoped
    // one is re-checked here too, belt and braces — visibility already
    // filtered the lookup, but the order itself must also be one this
    // user can see.
    if ($document['order_id'] !== null) {
        OrderAccess::requireVisibleOrder((int) $document['order_id'], $claims);
    }

    if ($document['storage_type'] === 'google_drive') {
        // The link is only ever handed to a requester who already passed
        // the visibility check above — never exposed to anyone else (§4.3.1).
        Response::json(['storage_type' => 'google_drive', 'drive_file_id' => $document['file_path']]);
    }
    if ($document['storage_type'] === 'link') {
        Response::json(['storage_type' => 'link', 'url' => $document['file_path']]);
    }

    $absolutePath = DocumentRepository::storageDir() . '/' . $document['file_path'];
    if (!is_file($absolutePath)) {
        Response::error('File missing from storage.', 404);
    }

    $disposition = DocumentRepository::isInlineViewable($document['file_path']) ? 'inline' : 'attachment';
    header('Content-Type: ' . DocumentRepository::mimeType($document['file_path']));
    header('Content-Disposition: ' . $disposition . '; filename="' . basename($document['file_path']) . '"');
    readfile($absolutePath);
    exit;
});

// ---------------------------------------------------------------------
// Manufacturing milestones (stage 3)
// ---------------------------------------------------------------------

$router->get('/api/orders/{id}/stages/{stageId}/milestones', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    $stage = OrderAccess::requireVisibleStage($orderId, (int) $params['stageId'], $claims);

    Response::json(ManufacturingMilestoneRepository::listForStage((int) $stage['id']));
});

$router->post('/api/orders/{id}/stages/{stageId}/milestones', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator']);

    $orderId = (int) $params['id'];
    $stage = OrderAccess::requireVisibleStage($orderId, (int) $params['stageId'], $claims);

    $name = (string) ($request->body['name'] ?? '');
    if ($name === '') {
        Response::error('name is required.', 422);
    }

    $milestone = ManufacturingMilestoneRepository::create(
        (int) $stage['id'],
        $name,
        (int) ($request->body['sequence'] ?? 0),
        $request->body['planned_date'] ?? null,
    );
    Response::json($milestone, 201);
});

$router->patch('/api/milestones/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator']);

    $milestone = ManufacturingMilestoneRepository::find((int) $params['id']);
    if ($milestone === null) {
        Response::error('Milestone not found.', 404);
    }
    OrderAccess::requireVisibleStageByPk((int) $milestone['order_stage_id'], $claims);

    $status = (string) ($request->body['status'] ?? '');
    if (!in_array($status, ['pending', 'done'], true)) {
        Response::error('status must be pending|done.', 422);
    }

    Response::json(ManufacturingMilestoneRepository::markStatus((int) $milestone['id'], $status));
});

// ---------------------------------------------------------------------
// FAT / SAT (stages 5 and 10) — FAT is the PC's to record (they
// coordinate with the supplier); SAT is the Engineer's (they run it
// with the customer on-site) — docs/ARCHITECTURE.md §3.
// ---------------------------------------------------------------------

$router->get('/api/orders/{id}/stages/{stageId}/fat-sat', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    $stage = OrderAccess::requireVisibleStage($orderId, (int) $params['stageId'], $claims);

    Response::json(FatSatRepository::listForStage((int) $stage['id']));
});

$router->post('/api/orders/{id}/stages/{stageId}/fat-sat', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);

    $type = (string) ($request->body['type'] ?? '');
    if (!in_array($type, ['FAT', 'SAT'], true)) {
        Response::error('type must be FAT|SAT.', 422);
    }
    Authenticator::requireRole($request, AcceptanceRules::rolesAllowedToRecord($type));

    $orderId = (int) $params['id'];
    $stage = OrderAccess::requireVisibleStage($orderId, (int) $params['stageId'], $claims);

    $record = FatSatRepository::create((int) $stage['id'], $type, $request->body['scheduled_date'] ?? null);
    Response::json($record, 201);
});

$router->patch('/api/fat-sat/{id}/result', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);

    $record = FatSatRepository::find((int) $params['id']);
    if ($record === null) {
        Response::error('FAT/SAT record not found.', 404);
    }
    Authenticator::requireRole($request, AcceptanceRules::rolesAllowedToRecord($record['type']));
    OrderAccess::requireVisibleStageByPk((int) $record['order_stage_id'], $claims);

    $result = (string) ($request->body['result'] ?? '');
    if (!in_array($result, ['pass', 'fail', 'conditional_pass'], true)) {
        Response::error('result must be pass|fail|conditional_pass.', 422);
    }

    // A critical open item can never be waved through as conditional_pass
    // (§3.3) — force the caller to record it honestly as a fail instead.
    if ($result === 'conditional_pass' && FatSatRepository::hasOpenCriticalItems((int) $record['id'])) {
        Response::error('An open critical punch-list item forces result=fail, not conditional_pass.', 422);
    }

    $reportDocumentId = isset($request->body['report_document_id']) ? (int) $request->body['report_document_id'] : null;
    Response::json(FatSatRepository::recordResult(
        (int) $record['id'],
        $result,
        $reportDocumentId,
        $request->body['notes'] ?? null,
    ));
});

$router->get('/api/fat-sat/{id}/punch-items', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);

    $record = FatSatRepository::find((int) $params['id']);
    if ($record === null) {
        Response::error('FAT/SAT record not found.', 404);
    }
    OrderAccess::requireVisibleStageByPk((int) $record['order_stage_id'], $claims);

    Response::json(FatSatRepository::listPunchListForRecord((int) $record['id']));
});

$router->post('/api/fat-sat/{id}/punch-items', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);

    $record = FatSatRepository::find((int) $params['id']);
    if ($record === null) {
        Response::error('FAT/SAT record not found.', 404);
    }
    Authenticator::requireRole($request, AcceptanceRules::rolesAllowedToRecord($record['type']));
    OrderAccess::requireVisibleStageByPk((int) $record['order_stage_id'], $claims);

    $description = (string) ($request->body['description'] ?? '');
    $severity = (string) ($request->body['severity'] ?? '');
    if ($description === '' || !in_array($severity, ['critical', 'minor'], true)) {
        Response::error('description is required and severity must be critical|minor.', 422);
    }

    $item = FatSatRepository::addPunchListItem(
        (int) $record['id'],
        $description,
        $severity,
        isset($request->body['assigned_to']) ? (int) $request->body['assigned_to'] : null,
        $request->body['target_resolution_date'] ?? null,
        (int) $claims['sub'],
    );
    Response::json($item, 201);
});

$router->patch('/api/punch-items/{id}/resolve', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator', 'installation_engineer']);

    $item = FatSatRepository::findPunchListItem((int) $params['id']);
    if ($item === null) {
        Response::error('Punch-list item not found.', 404);
    }
    $record = FatSatRepository::find((int) $item['fat_sat_record_id']);
    OrderAccess::requireVisibleStageByPk((int) $record['order_stage_id'], $claims);

    Response::json(FatSatRepository::resolvePunchListItem((int) $item['id'], (int) $claims['sub']));
});

$router->patch('/api/punch-items/{id}/verify', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator', 'sales_manager']);

    $item = FatSatRepository::findPunchListItem((int) $params['id']);
    if ($item === null) {
        Response::error('Punch-list item not found.', 404);
    }
    $record = FatSatRepository::find((int) $item['fat_sat_record_id']);
    OrderAccess::requireVisibleStageByPk((int) $record['order_stage_id'], $claims);

    Response::json(FatSatRepository::verifyPunchListItem((int) $item['id'], (int) $claims['sub']));
});

// ---------------------------------------------------------------------
// Engineer reports (stages 9 installation, 12 handover-readiness) and
// training records (stage 11) — the Engineer's own evidence tables.
// ---------------------------------------------------------------------

$router->get('/api/orders/{id}/stages/{stageId}/engineer-reports', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    $stage = OrderAccess::requireVisibleStage($orderId, (int) $params['stageId'], $claims);

    Response::json(EngineerReportRepository::listForStage((int) $stage['id']));
});

$router->post('/api/orders/{id}/stages/{stageId}/engineer-reports', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['installation_engineer']);

    $orderId = (int) $params['id'];
    $stage = OrderAccess::requireVisibleStage($orderId, (int) $params['stageId'], $claims);

    $type = (string) ($request->body['type'] ?? '');
    $completionStatus = (string) ($request->body['completion_status'] ?? '');
    if (!in_array($type, ['installation', 'handover_readiness'], true)
        || !in_array($completionStatus, ['complete', 'incomplete'], true)) {
        Response::error('type must be installation|handover_readiness, completion_status must be complete|incomplete.', 422);
    }

    $report = EngineerReportRepository::create(
        (int) $stage['id'],
        $type,
        (int) $claims['sub'],
        $completionStatus,
        $request->body['outstanding_issues'] ?? null,
        isset($request->body['report_document_id']) ? (int) $request->body['report_document_id'] : null,
        $request->body['notes'] ?? null,
    );
    Response::json($report, 201);
});

$router->get('/api/orders/{id}/stages/{stageId}/training', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    $stage = OrderAccess::requireVisibleStage($orderId, (int) $params['stageId'], $claims);

    Response::json(TrainingRecordRepository::listForStage((int) $stage['id']));
});

$router->post('/api/orders/{id}/stages/{stageId}/training', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['installation_engineer']);

    $orderId = (int) $params['id'];
    $stage = OrderAccess::requireVisibleStage($orderId, (int) $params['stageId'], $claims);

    $attendees = (string) ($request->body['attendees'] ?? '');
    if ($attendees === '') {
        Response::error('attendees is required.', 422);
    }

    $record = TrainingRecordRepository::create(
        (int) $stage['id'],
        $request->body['scheduled_date'] ?? null,
        $request->body['actual_date'] ?? null,
        $attendees,
        $request->body['materials_provided'] ?? null,
        isset($request->body['report_document_id']) ? (int) $request->body['report_document_id'] : null,
        $request->body['notes'] ?? null,
    );
    Response::json($record, 201);
});

// Structured customer-staff detail for a training record — who to actually
// contact after handover, alongside the freeform attendees summary above.
$router->get('/api/training-records/{id}/attendees', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $trainingRecordId = (int) $params['id'];

    $record = TrainingRecordRepository::find($trainingRecordId);
    if ($record === null) {
        Response::error('Training record not found.', 404);
    }
    OrderAccess::requireVisibleStageByPk((int) $record['order_stage_id'], $claims);

    Response::json(TrainingAttendeeRepository::listForTrainingRecord($trainingRecordId));
});

$router->post('/api/training-records/{id}/attendees', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['installation_engineer']);

    $trainingRecordId = (int) $params['id'];
    $record = TrainingRecordRepository::find($trainingRecordId);
    if ($record === null) {
        Response::error('Training record not found.', 404);
    }
    OrderAccess::requireVisibleStageByPk((int) $record['order_stage_id'], $claims);

    $name = (string) ($request->body['name'] ?? '');
    if ($name === '') {
        Response::error('name is required.', 422);
    }

    $attendee = TrainingAttendeeRepository::create(
        $trainingRecordId,
        $name,
        $request->body['department'] ?? null,
        $request->body['designation'] ?? null,
        $request->body['phone'] ?? null,
        $request->body['email'] ?? null,
    );
    Response::json($attendee, 201);
});

// ---------------------------------------------------------------------
// Acceptances (§3.4) — Sales Manager or Customer only, never on
// someone else's behalf: accepted_by_type must match the caller's own
// role, accepted_by_user_id is always the caller, never client-supplied.
// ---------------------------------------------------------------------

$router->get('/api/orders/{id}/stages/{stageId}/acceptances', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    $stage = OrderAccess::requireVisibleStage($orderId, (int) $params['stageId'], $claims);

    Response::json(AcceptanceRepository::listForStage((int) $stage['id']));
});

$router->post('/api/orders/{id}/stages/{stageId}/acceptances', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['sales_manager', 'customer']);

    $orderId = (int) $params['id'];
    $stageId = (int) $params['stageId'];
    $stage = OrderAccess::requireVisibleStage($orderId, $stageId, $claims);

    $expectedType = AcceptanceRules::TYPE_BY_STAGE[$stageId] ?? null;
    if ($expectedType === null) {
        Response::error('This stage does not take an acceptance.', 422);
    }

    $targetRecordId = isset($request->body['target_record_id']) ? (int) $request->body['target_record_id'] : null;
    if ($targetRecordId === null) {
        Response::error('target_record_id is required.', 422);
    }

    $targetTable = AcceptanceRules::TARGET_TABLE_BY_TYPE[$expectedType];
    $targetRecord = match ($targetTable) {
        'fat_sat_record' => FatSatRepository::find($targetRecordId),
        'training_record' => TrainingRecordRepository::find($targetRecordId),
        'engineer_report' => EngineerReportRepository::find($targetRecordId),
    };
    if ($targetRecord === null || (int) $targetRecord['order_stage_id'] !== (int) $stage['id']) {
        Response::error('target_record_id does not belong to this stage.', 422);
    }
    // A superseded FAT/SAT record can't be accepted — only the current
    // (retested) one counts (§3.3).
    if ($targetTable === 'fat_sat_record' && $targetRecord['superseded_by'] !== null) {
        Response::error('This FAT/SAT record has been superseded by a retest — accept the current record instead.', 422);
    }

    $acceptedByType = (string) $claims['role'] === 'customer' ? 'customer' : 'sales_manager';
    $evidenceDocId = isset($request->body['customer_authorization_evidence_document_id'])
        ? (int) $request->body['customer_authorization_evidence_document_id'] : null;

    $acceptance = AcceptanceRepository::create(
        (int) $stage['id'],
        $targetTable,
        $targetRecordId,
        $expectedType,
        $acceptedByType,
        (int) $claims['sub'],
        $evidenceDocId,
        $request->body['conditions_notes'] ?? null,
    );
    Response::json($acceptance, 201);
});
