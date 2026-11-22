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
            subject: 'Your WoSPIS temporary password',
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
        $contactEmail = e((string) config('mail.contact_address', 'miguel102104@gmail.com'));

        return new Content(
            htmlString: <<<HTML
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#FFD500;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFD500;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:18px;overflow:hidden;border:2px solid #000000;font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td style="background:#4AECED;height:8px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background:#1D54D3;padding:28px 32px 22px;">
              <p style="margin:0;color:#4AECED;font-size:11px;letter-spacing:1.8px;font-weight:bold;">FILAMER CHRISTIAN UNIVERSITY</p>
              <h1 style="margin:10px 0 0;color:#FFD500;font-size:30px;line-height:1.1;">WoSPIS</h1>
              <p style="margin:8px 0 0;color:#FFFFFF;font-size:14px;">A Work Study Program Information System for Filamer Christian University, Inc.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0;font-size:0;line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="34%" style="background:#102179;height:6px;">&nbsp;</td>
                  <td width="33%" style="background:#1D54D3;height:6px;">&nbsp;</td>
                  <td width="33%" style="background:#CC1E1B;height:6px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;background:#FFFFFF;">
              <p style="margin:0 0 14px;color:#102179;font-size:18px;font-weight:bold;">Hello {$name},</p>
              <p style="margin:0 0 22px;color:#000000;font-size:15px;line-height:1.6;">A password reset was requested for your WoSPIS account. Use the temporary password below to sign in. You will be asked to choose a new password before you can continue.</p>
              <p style="margin:0 0 6px;color:#1D54D3;font-size:11px;font-weight:bold;letter-spacing:1.2px;">USERNAME</p>
              <p style="margin:0 0 18px;color:#102179;font-size:16px;font-weight:bold;">{$username}</p>
              <p style="margin:0 0 6px;color:#1D54D3;font-size:11px;font-weight:bold;letter-spacing:1.2px;">EMAIL</p>
              <p style="margin:0 0 18px;color:#102179;font-size:16px;font-weight:bold;">{$accountEmail}</p>
              <p style="margin:0 0 8px;color:#1D54D3;font-size:11px;font-weight:bold;letter-spacing:1.2px;">TEMPORARY PASSWORD</p>
              <p style="margin:0 0 24px;background:#FFD500;border:2px solid #000000;border-radius:12px;padding:16px 12px;color:#102179;font-size:22px;font-weight:bold;letter-spacing:1px;text-align:center;">{$password}</p>
              <p style="margin:0;color:#000000;font-size:13px;line-height:1.6;">If you did not request this, contact the Work-Study Program office.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#102179;">
              <p style="margin:0;color:#FFD500;font-size:13px;font-weight:bold;">WoSPIS WSPO</p>
              <p style="margin:4px 0 0;color:#4AECED;font-size:13px;">{$contactEmail}</p>
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
