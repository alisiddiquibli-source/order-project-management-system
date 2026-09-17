<?php

declare(strict_types=1);

namespace Bli\Notifications;

use PHPMailer\PHPMailer\Exception as PHPMailerException;
use PHPMailer\PHPMailer\PHPMailer;

/**
 * Best-effort SMTP delivery for the in-app notifications already recorded
 * in the `notifications` table (docs/ROADMAP.md Phase 3b). Email is a
 * convenience on top of that record, never the record itself — a send
 * failure is logged and swallowed, not thrown, so a flaky mail server
 * never blocks the cron from flagging a deadline or an API request from
 * saving a comment.
 *
 * With MAIL_HOST unset (local dev, no SMTP configured), send() logs to
 * error_log instead of attempting delivery.
 */
final class Mailer
{
    public static function send(string $toEmail, string $toName, string $subject, string $body): void
    {
        $host = $_ENV['MAIL_HOST'] ?? '';
        if ($host === '') {
            error_log("Mailer: MAIL_HOST not configured, skipping send to {$toEmail}: {$subject}");

            return;
        }

        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host = $host;
            $mail->Port = (int) ($_ENV['MAIL_PORT'] ?? 587);
            $username = $_ENV['MAIL_USERNAME'] ?? '';
            // Some internal relays (or a local test server) take unauthenticated
            // connections — only turn on AUTH when credentials are configured.
            $mail->SMTPAuth = $username !== '';
            $mail->Username = $username;
            $mail->Password = $_ENV['MAIL_PASSWORD'] ?? '';
            $encryption = $_ENV['MAIL_ENCRYPTION'] ?? 'tls';
            if ($encryption !== '') {
                $mail->SMTPSecure = $encryption;
            }
            $mail->CharSet = 'UTF-8';

            $mail->setFrom(
                $_ENV['MAIL_FROM_ADDRESS'] ?? 'noreply@businesslinks-pk.com',
                $_ENV['MAIL_FROM_NAME'] ?? 'BLI Order & Project Management System'
            );
            $mail->addAddress($toEmail, $toName);
            $mail->Subject = $subject;
            $mail->Body = $body;
            $mail->isHTML(false);

            $mail->send();
        } catch (PHPMailerException $e) {
            error_log("Mailer: failed to send to {$toEmail} — {$mail->ErrorInfo}");
        }
    }
}
