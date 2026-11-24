<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TemporaryPasswordMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public string $temporaryPassword,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your WoSPIS Temporary Password',
        );
    }

    public function content(): Content
    {
        $name = e($this->user->name ?: $this->user->username);
        $username = e($this->user->username);
        $accountEmail = is_string($this->user->email) && filter_var($this->user->email, FILTER_VALIDATE_EMAIL)
            ? $this->user->email
            : (filter_var($this->user->username, FILTER_VALIDATE_EMAIL) ? $this->user->username : 'Not on file');
        $accountEmail = e($accountEmail);
        $password = e($this->temporaryPassword);
        $contactEmail = e((string) config('mail.contact_address', 'wspo.wospis@gmail.com'));

        return new Content(
            htmlString: <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your WoSPIS Temporary Password</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1E293B;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F6F9;padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;box-shadow:0 4px 12px rgba(15,23,42,0.05);">

          <!-- Gold Accent Bar -->
          <tr>
            <td style="background-color:#D4A017;height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Institutional Header -->
          <tr>
            <td style="background-color:#0F2557;padding:32px 36px 28px;">
              <p style="margin:0;color:#CBD5E1;font-size:11px;letter-spacing:1.6px;font-weight:600;text-transform:uppercase;">
                Filamer Christian University, Inc.
              </p>
              <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:24px;font-weight:700;letter-spacing:-0.3px;line-height:1.2;">
                WoSPIS
              </h1>
              <p style="margin:6px 0 0;color:#94A3B8;font-size:13px;line-height:1.4;">
                Work-Study Program Information System
              </p>
            </td>
          </tr>

          <!-- Email Body -->
          <tr>
            <td style="padding:36px 36px 32px;background-color:#FFFFFF;">
              <p style="margin:0 0 16px;color:#0F172A;font-size:17px;font-weight:600;">
                Dear {$name},
              </p>
              <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.65;">
                A password reset was requested for your WoSPIS account. Please use the temporary password below to sign in. For your security, you will be prompted to set a new password immediately after logging in.
              </p>

              <!-- Account Details Table -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:14px 18px;border-bottom:1px solid #E2E8F0;">
                    <p style="margin:0;color:#64748B;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Username</p>
                    <p style="margin:4px 0 0;color:#0F172A;font-size:15px;font-weight:600;">{$username}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;color:#64748B;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Account Email</p>
                    <p style="margin:4px 0 0;color:#0F172A;font-size:15px;font-weight:600;">{$accountEmail}</p>
                  </td>
                </tr>
              </table>

              <!-- Temporary Password Box -->
              <p style="margin:0 0 8px;color:#64748B;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">
                Temporary Password
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center" style="background-color:#EFF6FF;border:1px dashed #93C5FD;border-radius:8px;padding:18px 16px;">
                    <span style="font-family:Consolas,'Courier New',monospace;color:#0F2557;font-size:22px;font-weight:700;letter-spacing:2px;">
                      {$password}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #D4A017;background-color:#FFFBEB;border-radius:0 6px 6px 0;">
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0;color:#78350F;font-size:13px;line-height:1.55;">
                      <strong>Didn't request this?</strong> Please contact the Work-Study Program Office immediately so we can secure your account.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;">
              <p style="margin:0;color:#0F2557;font-size:13px;font-weight:600;">
                Work-Study Program Office (WSPO)
              </p>
              <p style="margin:4px 0 0;color:#64748B;font-size:12px;line-height:1.5;">
                Filamer Christian University, Inc. &middot;
                <a href="mailto:{$contactEmail}" style="color:#1D4ED8;text-decoration:none;">{$contactEmail}</a>
              </p>
              <p style="margin:10px 0 0;color:#94A3B8;font-size:11px;">
                This is an automated message from WoSPIS. Please do not share your temporary password with anyone.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML
        );
    }
}
