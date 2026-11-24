<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class LoginOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public string $code,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your WoSPIS sign-in code',
        );
    }

    public function content(): Content
    {
        $name = e($this->user->name ?: $this->user->username);
        $code = e($this->code);
        $contactEmail = e((string) config('mail.contact_address', 'wspo.wospis@gmail.com'));

        return new Content(
            htmlString: <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your WoSPIS sign-in code</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1E293B;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F6F9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;">
          <tr>
            <td style="background-color:#D4A017;height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#0F2557;padding:32px 36px 28px;">
              <p style="margin:0;color:#CBD5E1;font-size:11px;letter-spacing:1.6px;font-weight:600;text-transform:uppercase;">Filamer Christian University, Inc.</p>
              <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:24px;font-weight:700;">WoSPIS</h1>
              <p style="margin:6px 0 0;color:#94A3B8;font-size:13px;">Work-Study Program Information System</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 36px 32px;">
              <p style="margin:0 0 16px;color:#0F172A;font-size:17px;font-weight:600;">Dear {$name},</p>
              <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.65;">
                Use this 8-digit code to sign in to WoSPIS. It expires in 10 minutes. Your password still works if you would rather sign in that way.
              </p>
              <p style="margin:0 0 8px;color:#64748B;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Sign-in code</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center" style="background-color:#EFF6FF;border:1px dashed #93C5FD;border-radius:8px;padding:18px 16px;">
                    <span style="font-family:Consolas,'Courier New',monospace;color:#0F2557;font-size:28px;font-weight:700;letter-spacing:6px;">{$code}</span>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #D4A017;background-color:#FFFBEB;">
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0;color:#78350F;font-size:13px;line-height:1.55;">
                      <strong>Didn't request this?</strong> You can ignore this email. The code cannot be used after it expires.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;">
              <p style="margin:0;color:#0F2557;font-size:13px;font-weight:600;">Work-Study Program Office (WSPO)</p>
              <p style="margin:4px 0 0;color:#64748B;font-size:12px;">
                Filamer Christian University, Inc. ·
                <a href="mailto:{$contactEmail}" style="color:#1D4ED8;text-decoration:none;">{$contactEmail}</a>
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
