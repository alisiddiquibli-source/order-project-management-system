<?php

declare(strict_types=1);

namespace Bli\Domain;

use Bli\Ai\AiAdvisorService;
use Bli\Ai\AiProviderException;
use Bli\Config\Database;
use Bli\Models\NotificationRepository;

/**
 * The daily AI monitoring digest (docs/ARCHITECTURE.md §10): one status
 * report per active project, notified to that project's Sales Manager
 * and PC, plus one portfolio-wide advisory notified to every Company
 * Owner. Run by cron/check_ai_digest.php.
 *
 * A provider failure for one project must not stop the rest — each
 * generation is caught and counted separately, same as any other batch
 * job in this codebase (see DeadlineScanner, TicketSlaScanner).
 */
final class AiDigestScanner
{
    /**
     * @return array{project_digests: int, portfolio_digests: int, failures: int}
     */
    public function run(): array
    {
        $projectDigests = $this->generateProjectDigests();
        $portfolioDigests = $this->generatePortfolioDigest();

        return [
            'project_digests' => $projectDigests['count'],
            'portfolio_digests' => $portfolioDigests['count'],
            'failures' => $projectDigests['failures'] + $portfolioDigests['failures'],
        ];
    }

    /**
     * @return array{count: int, failures: int}
     */
    private function generateProjectDigests(): array
    {
        $db = Database::connection();
        $projects = $db->query("SELECT id, sales_manager_id, project_coordinator_id FROM projects WHERE status = 'active'")
            ->fetchAll();

        $count = 0;
        $failures = 0;
        foreach ($projects as $project) {
            $facts = AiDataGatherer::projectStatusFactsUnscoped((int) $project['id']);
            if ($facts === null) {
                continue;
            }

            try {
                $prompt = AiAdvisorService::renderProjectStatusPrompt($facts);
                $report = AiAdvisorService::storeSystemGenerated(null, (int) $project['id'], 'daily_digest', $prompt);
            } catch (AiProviderException $e) {
                error_log("AiDigestScanner: project {$project['id']} digest failed — {$e->getMessage()}");
                $failures++;
                continue;
            }

            foreach (array_filter([$project['sales_manager_id'], $project['project_coordinator_id']]) as $userId) {
                NotificationRepository::create(
                    (int) $userId,
                    null,
                    'ai_daily_digest',
                    "Your daily project status digest is ready (AI report #{$report['id']})."
                );
            }
            $count++;
        }

        return ['count' => $count, 'failures' => $failures];
    }

    /**
     * @return array{count: int, failures: int}
     */
    private function generatePortfolioDigest(): array
    {
        $db = Database::connection();
        $owners = $db->query("SELECT id FROM users WHERE role = 'company_owner' AND status = 'active'")->fetchAll();
        if ($owners === []) {
            return ['count' => 0, 'failures' => 0];
        }

        try {
            $facts = AiDataGatherer::portfolioFactsUnscoped();
            $prompt = AiAdvisorService::renderPortfolioPrompt($facts);
            $report = AiAdvisorService::storeSystemGenerated(null, null, 'daily_digest', $prompt);
        } catch (AiProviderException $e) {
            error_log("AiDigestScanner: portfolio digest failed — {$e->getMessage()}");

            return ['count' => 0, 'failures' => 1];
        }

        foreach ($owners as $owner) {
            NotificationRepository::create(
                (int) $owner['id'],
                null,
                'ai_daily_digest',
                "Your daily portfolio advisory is ready (AI report #{$report['id']})."
            );
        }

        return ['count' => 1, 'failures' => 0];
    }
}
