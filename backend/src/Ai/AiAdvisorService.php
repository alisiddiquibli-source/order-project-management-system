<?php

declare(strict_types=1);

namespace Bli\Ai;

use Bli\Domain\AiDataGatherer;
use Bli\Models\AiReportRepository;

/**
 * Orchestrates one AI use case end to end (docs/ARCHITECTURE.md §10):
 * gather scoped facts -> render a prompt -> call the configured provider
 * -> persist to `ai_reports`. Never called on a page load — only from an
 * explicit user action (a route) or the daily digest cron.
 */
final class AiAdvisorService
{
    private const PROVIDER_ADAPTERS = [
        'claude' => ClaudeAdapter::class,
        'gemini' => GeminiAdapter::class,
        'chatgpt' => ChatGptAdapter::class,
    ];

    private const RISK_ADVISORY_SYSTEM_PROMPT = <<<'PROMPT'
        You are an operations risk advisor for Business Links International, a
        capital-equipment import/installation company. You will be given the
        current state of one customer order moving through a 12-stage
        pipeline (requirements through post-handover). Identify real risks to
        the delivery timeline and flag anything needing attention. Be
        specific and concrete — cite stage names, dates, and who a blocker is
        waiting on. Do not invent facts not present in the data. This is
        advisory only: end with a short list of suggested next actions, not
        instructions to take automatically.
        PROMPT;

    private const PROJECT_STATUS_SYSTEM_PROMPT = <<<'PROMPT'
        You are a status-reporting assistant for Business Links International.
        You will be given every order in one customer project. Summarize
        overall project health in plain language suitable for a Sales
        Manager or Company Owner skimming quickly: what's on track, what's
        at risk, and why. Do not invent facts not present in the data.
        PROMPT;

    private const PORTFOLIO_ADVISORY_SYSTEM_PROMPT = <<<'PROMPT'
        You are a portfolio risk advisor for Business Links International's
        Company Owner. You will be given open blockers and recent commitment
        changes aggregated across every active project, broken down by which
        party (BLI internal, supplier, customer, or third party) is
        responsible for each blocker. Identify cross-project patterns —
        e.g. a supplier that recurs across multiple delayed projects, or a
        project accumulating internal blockers. **Attribute risk by
        responsible_party, never by raw counts alone, and never imply a
        Project Coordinator is at fault for a blocker whose responsible
        party is the customer, a supplier, or a third party.** Do not
        invent facts not present in the data. End with suggested next
        actions, advisory only.
        PROMPT;

    private const FOLLOW_UP_DRAFT_SYSTEM_PROMPT = <<<'PROMPT'
        You are drafting a follow-up message for Business Links
        International to post on one order's comment thread. You will be
        given the order's current state and the last several messages on
        the specific channel this draft is for (internal, customer, or
        supplier). Match the tone appropriate to that audience — direct and
        detailed for internal, clear and professional for customer/supplier.
        Write only the message text, ready to review and send — no
        preamble, no explanation of what you wrote.
        PROMPT;

    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null null when the order isn't found/visible
     */
    public static function generateOrderRiskAdvisory(int $orderId, array $claims): ?array
    {
        $facts = AiDataGatherer::orderRiskFacts($orderId, $claims);
        if ($facts === null) {
            return null;
        }

        $prompt = self::renderOrderRiskPrompt($facts);

        return self::runAndStore($orderId, null, 'order_risk_advisory', $prompt, (int) $claims['sub']);
    }

    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null null when the project isn't found/visible
     */
    public static function generateProjectStatusReport(int $projectId, array $claims): ?array
    {
        $facts = AiDataGatherer::projectStatusFacts($projectId, $claims);
        if ($facts === null) {
            return null;
        }

        $prompt = self::renderProjectStatusPrompt($facts);

        return self::runAndStore(null, $projectId, 'project_status_report', $prompt, (int) $claims['sub']);
    }

    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null null when the requester isn't a Company Owner
     */
    public static function generatePortfolioAdvisory(array $claims): ?array
    {
        $facts = AiDataGatherer::portfolioFacts($claims);
        if ($facts === null) {
            return null;
        }

        $prompt = self::renderPortfolioPrompt($facts);

        return self::runAndStore(null, null, 'portfolio_advisory', $prompt, (int) $claims['sub']);
    }

    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null null when the order isn't found/visible
     */
    public static function generateFollowUpDraft(int $orderId, string $channel, array $claims): ?array
    {
        $facts = AiDataGatherer::followUpDraftFacts($orderId, $channel, $claims);
        if ($facts === null) {
            return null;
        }

        $prompt = self::renderFollowUpDraftPrompt($facts);

        return self::runAndStore($orderId, null, 'follow_up_draft', $prompt, (int) $claims['sub']);
    }

    /**
     * System-generated variant for the daily digest cron — no requester
     * claims exist, so the caller (AiDigestScanner) is trusted to have
     * already picked a legitimate order/project/portfolio scope itself.
     *
     * @param array{system: string, user: string} $prompt
     * @return array<string, mixed>
     */
    public static function storeSystemGenerated(?int $orderId, ?int $projectId, string $type, array $prompt): array
    {
        return self::runAndStore($orderId, $projectId, $type, $prompt, null);
    }

    /**
     * @param array{system: string, user: string} $prompt
     * @param int|null $createdBy null for system-generated (cron/digest)
     * @return array<string, mixed>
     */
    private static function runAndStore(?int $orderId, ?int $projectId, string $type, array $prompt, ?int $createdBy): array
    {
        $provider = $_ENV['AI_DEFAULT_PROVIDER'] ?? 'claude';
        $adapterClass = self::PROVIDER_ADAPTERS[$provider] ?? self::PROVIDER_ADAPTERS['claude'];
        /** @var ProviderAdapter $adapter */
        $adapter = new $adapterClass();

        $response = $adapter->complete($prompt['system'], $prompt['user']);

        return AiReportRepository::create($orderId, $projectId, $type, $provider, $prompt['user'], $response, $createdBy);
    }

    /**
     * @param array<string, mixed> $facts
     * @return array{system: string, user: string}
     */
    public static function renderOrderRiskPrompt(array $facts): array
    {
        $order = $facts['order'];
        $lines = ["Order {$order['order_number']} ({$order['machine_name']}), status: {$order['status']}, target handover: {$order['target_handover_date']}."];

        $lines[] = "\nStages:";
        foreach ($facts['stages'] as $stage) {
            $lines[] = "- {$stage['stage_name']}: {$stage['status']}"
                . ($stage['planned_end'] ? ", planned end {$stage['planned_end']}" : '')
                . ($stage['notes'] ? " — note: {$stage['notes']}" : '');
        }

        if ($facts['open_blockers'] !== []) {
            $lines[] = "\nOpen blockers:";
            foreach ($facts['open_blockers'] as $blocker) {
                $lines[] = "- [{$blocker['stage_name']}] responsible: {$blocker['responsible_party']}"
                    . ($blocker['responsible_party_detail'] ? " ({$blocker['responsible_party_detail']})" : '')
                    . " — {$blocker['description']}. Next action: {$blocker['next_action']}, review by {$blocker['next_review_date']}.";
            }
        } else {
            $lines[] = "\nNo open blockers.";
        }

        if ($facts['recent_commitment_changes'] !== []) {
            $lines[] = "\nRecent commitment changes:";
            foreach ($facts['recent_commitment_changes'] as $change) {
                $lines[] = "- {$change['field_name']}: {$change['old_value']} -> {$change['new_value']}"
                    . " (customer informed: " . ($change['customer_informed'] ? 'yes' : 'no') . ") — {$change['reason']}";
            }
        }

        $lines[] = "\nOpen service tickets on this order: {$facts['open_service_tickets']}.";

        return ['system' => self::RISK_ADVISORY_SYSTEM_PROMPT, 'user' => implode("\n", $lines)];
    }

    /**
     * @param array<string, mixed> $facts
     * @return array{system: string, user: string}
     */
    public static function renderProjectStatusPrompt(array $facts): array
    {
        $project = $facts['project'];
        $lines = ["Project {$project['project_number']}: {$project['title']}, status: {$project['status']}."];

        $lines[] = "\nOrders in this project:";
        foreach ($facts['orders'] as $order) {
            $lines[] = "- {$order['order_number']} ({$order['machine_name']}), status: {$order['status']}, "
                . "target handover {$order['target_handover_date']}: {$order['stages_completed']}/{$order['stages_total']} "
                . "stages completed, {$order['stages_at_risk']} stage(s) delayed or blocked.";
        }

        return ['system' => self::PROJECT_STATUS_SYSTEM_PROMPT, 'user' => implode("\n", $lines)];
    }

    /**
     * @param array<string, mixed> $facts
     * @return array{system: string, user: string}
     */
    public static function renderPortfolioPrompt(array $facts): array
    {
        $lines = ['Orders by status:'];
        foreach ($facts['orders_by_status'] as $row) {
            $lines[] = "- {$row['status']}: {$row['count']}";
        }

        $lines[] = "\nOpen blockers by project and responsible party:";
        foreach ($facts['open_blockers_by_project_and_party'] as $row) {
            $lines[] = "- {$row['project_number']}: {$row['open_count']} open, responsible party: {$row['responsible_party']}";
        }
        if ($facts['open_blockers_by_project_and_party'] === []) {
            $lines[] = '- None.';
        }

        $lines[] = "\nCommitment changes in the last 30 days, by project:";
        foreach ($facts['commitment_changes_last_30_days_by_project'] as $row) {
            $lines[] = "- {$row['project_number']}: {$row['change_count']} change(s), {$row['customer_informed_count']} of which informed the customer";
        }
        if ($facts['commitment_changes_last_30_days_by_project'] === []) {
            $lines[] = '- None.';
        }

        $lines[] = "\nOpen service tickets, portfolio-wide: {$facts['open_service_tickets_portfolio_wide']}.";

        return ['system' => self::PORTFOLIO_ADVISORY_SYSTEM_PROMPT, 'user' => implode("\n", $lines)];
    }

    /**
     * @param array<string, mixed> $facts
     * @return array{system: string, user: string}
     */
    public static function renderFollowUpDraftPrompt(array $facts): array
    {
        $order = $facts['order'];
        $lines = ["Order {$order['order_number']} ({$order['machine_name']}), status: {$order['status']}."];
        $lines[] = "Drafting for the '{$facts['channel']}' channel.";

        $lines[] = "\nRecent messages on this channel:";
        if ($facts['recent_comments'] === []) {
            $lines[] = '- None yet — this would be the opening message.';
        }
        foreach ($facts['recent_comments'] as $comment) {
            $lines[] = "- {$comment['user_name']} ({$comment['created_at']}): {$comment['message']}";
        }

        return ['system' => self::FOLLOW_UP_DRAFT_SYSTEM_PROMPT, 'user' => implode("\n", $lines)];
    }
}
