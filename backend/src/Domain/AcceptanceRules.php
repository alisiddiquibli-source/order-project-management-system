<?php

declare(strict_types=1);

namespace Bli\Domain;

/**
 * Static lookup tables for the acceptance model (docs/ARCHITECTURE.md §3.4):
 * which acceptance `type` a stage takes, and which evidence table it targets.
 */
final class AcceptanceRules
{
    public const TYPE_BY_STAGE = [
        5 => 'fat_conditional',
        10 => 'sat_result',
        11 => 'training_ack',
        12 => 'handover_confirmation',
    ];

    public const TARGET_TABLE_BY_TYPE = [
        'fat_conditional' => 'fat_sat_record',
        'sat_result' => 'fat_sat_record',
        'training_ack' => 'training_record',
        'handover_confirmation' => 'engineer_report',
    ];

    /**
     * FAT is the PC's to record (they coordinate with the supplier); SAT
     * is the Engineer's (they run it with the customer on-site) — §3.
     *
     * @return string[]
     */
    public static function rolesAllowedToRecord(string $fatOrSatType): array
    {
        return $fatOrSatType === 'FAT' ? ['project_coordinator'] : ['installation_engineer'];
    }
}
