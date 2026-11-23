@php
    $contactEmail = (string) config('mail.contact_address', 'miguel102104@gmail.com');
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ $heading }}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1E293B;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F6F9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;box-shadow:0 4px 12px rgba(15,23,42,0.05);">
          <tr>
            <td style="background-color:#D4A017;height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
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
          <tr>
            <td style="padding:36px 36px 32px;background-color:#FFFFFF;">
              <h2 style="margin:0 0 18px;color:#0F2557;font-size:20px;font-weight:700;line-height:1.3;">
                {{ $heading }}
              </h2>
              <p style="margin:0 0 16px;color:#0F172A;font-size:15px;font-weight:600;">
                Dear {{ $recipientName }},
              </p>
              @foreach ($paragraphs as $paragraph)
                <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.65;">
                  {{ $paragraph }}
                </p>
              @endforeach

              @if ($details !== [])
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin:8px 0 24px;">
                  @foreach ($details as $detail)
                    <tr>
                      <td style="padding:14px 18px;{{ $loop->last ? '' : 'border-bottom:1px solid #E2E8F0;' }}">
                        <p style="margin:0;color:#64748B;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">{{ $detail['label'] }}</p>
                        <p style="margin:4px 0 0;color:#0F172A;font-size:15px;font-weight:600;">{{ $detail['value'] }}</p>
                      </td>
                    </tr>
                  @endforeach
                </table>
              @endif

              @if ($notice !== '')
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #D4A017;background-color:#FFFBEB;border-radius:0 6px 6px 0;">
                  <tr>
                    <td style="padding:12px 16px;">
                      <p style="margin:0;color:#78350F;font-size:13px;line-height:1.55;">
                        {{ $notice }}
                      </p>
                    </td>
                  </tr>
                </table>
              @endif
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;">
              <p style="margin:0;color:#0F2557;font-size:13px;font-weight:600;">
                Work-Study Program Office (WSPO)
              </p>
              <p style="margin:4px 0 0;color:#64748B;font-size:12px;line-height:1.5;">
                Filamer Christian University, Inc. &middot;
                <a href="mailto:{{ $contactEmail }}" style="color:#1D4ED8;text-decoration:none;">{{ $contactEmail }}</a>
              </p>
              <p style="margin:10px 0 0;color:#94A3B8;font-size:11px;">
                This is an automated security message from WoSPIS. It never includes your password.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
