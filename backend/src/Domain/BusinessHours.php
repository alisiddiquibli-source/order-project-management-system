<?php

declare(strict_types=1);

namespace Bli\Domain;

use DateTimeImmutable;

/**
 * SLA clocks run in business hours/days, not calendar time
 * (docs/ARCHITECTURE.md §5) — configurable by the Company Owner (§7.1)
 * via BUSINESS_HOURS_START/END and BUSINESS_DAYS.
 */
final class BusinessHours
{
    /**
     * Hours of overlap between [$from, $to] and the configured business
     * window, summed day by day. Used against `response_target_hours`/
     * `resolution_target_hours` on an open service ticket.
     */
    public static function elapsedBusinessHours(DateTimeImmutable $from, DateTimeImmutable $to): float
    {
        if ($to <= $from) {
            return 0.0;
        }

        [$startHour, $startMinute] = self::parseTime($_ENV['BUSINESS_HOURS_START'] ?? '09:00');
        [$endHour, $endMinute] = self::parseTime($_ENV['BUSINESS_HOURS_END'] ?? '18:00');
        $businessDays = self::businessDayNames();

        $totalSeconds = 0;
        $cursor = $from->setTime(0, 0);
        $lastDay = $to->setTime(0, 0);

        while ($cursor <= $lastDay) {
            if (in_array($cursor->format('D'), $businessDays, true)) {
                $dayStart = $cursor->setTime($startHour, $startMinute);
                $dayEnd = $cursor->setTime($endHour, $endMinute);

                $windowStart = max($dayStart, $from);
                $windowEnd = min($dayEnd, $to);

                if ($windowEnd > $windowStart) {
                    $totalSeconds += $windowEnd->getTimestamp() - $windowStart->getTimestamp();
                }
            }

            $cursor = $cursor->modify('+1 day');
        }

        return $totalSeconds / 3600;
    }

    /**
     * Full business days elapsed strictly after $from's calendar day, up
     * through $to. Used for the 5-business-day auto-close window
     * following `resolved_at` — a day-granularity count, not hours.
     */
    public static function businessDaysElapsedSince(DateTimeImmutable $from, DateTimeImmutable $to): int
    {
        $businessDays = self::businessDayNames();

        $count = 0;
        $cursor = $from->setTime(0, 0)->modify('+1 day');
        $end = $to->setTime(0, 0);

        while ($cursor <= $end) {
            if (in_array($cursor->format('D'), $businessDays, true)) {
                $count++;
            }
            $cursor = $cursor->modify('+1 day');
        }

        return $count;
    }

    /**
     * @return array{0: int, 1: int}
     */
    private static function parseTime(string $hhmm): array
    {
        [$hour, $minute] = array_map('intval', explode(':', $hhmm));

        return [$hour, $minute];
    }

    /**
     * @return array<int, string> three-letter day names as DateTime's 'D' format gives them
     */
    private static function businessDayNames(): array
    {
        $raw = $_ENV['BUSINESS_DAYS'] ?? 'Mon,Tue,Wed,Thu,Fri,Sat';

        return array_map('trim', explode(',', $raw));
    }
}
