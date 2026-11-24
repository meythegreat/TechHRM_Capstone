@php
$badgeStyles = match ($status) {
'Pending' => 'background-color:#FEF3C7;color:#92400E;border:1px solid #FDE68A;',
'Interview' => 'background-color:#DBEAFE;color:#1E40AF;border:1px solid #BFDBFE;',
'Training' => 'background-color:#E0E7FF;color:#3730A3;border:1px solid #C7D2FE;',
'For Result' => 'background-color:#F3E8FF;color:#6B21A8;border:1px solid #E9D5FF;',
'Approved' => 'background-color:#DCFCE7;color:#166534;border:1px solid #BBF7D0;',
'Rejected' => 'background-color:#FEE2E2;color:#991B1B;border:1px solid #FECACA;',
default => 'background-color:#F1F5F9;color:#334155;border:1px solid #E2E8F0;',
};

$contactEmail = (string) config('mail.contact_address', 'wspo.wospis@gmail.com');
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

                    <!-- Status & Tracking Strip -->
                    <tr>
                        <td style="padding:18px 36px;background-color:#F8FAFC;border-bottom:1px solid #E2E8F0;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="left" valign="middle">
                                        <span style="display:inline-block;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;{{ $badgeStyles }}">
                                            {{ $badgeLabel }}
                                        </span>
                                    </td>
                                    <td align="right" valign="middle">
                                        <span style="color:#64748B;font-size:11px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;">Tracking Code: </span>
                                        <span style="font-family:Consolas,'Courier New',monospace;color:#0F2557;font-size:13px;font-weight:700;">
                                            {{ $trackingCode }}
                                        </span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Email Body -->
                    <tr>
                        <td style="padding:36px 36px 32px;background-color:#FFFFFF;">
                            <h2 style="margin:0 0 18px;color:#0F2557;font-size:20px;font-weight:700;line-height:1.3;">
                                {{ $heading }}
                            </h2>

                            <p style="margin:0 0 16px;color:#0F172A;font-size:15px;font-weight:600;">
                                Dear {{ $applicantName }},
                            </p>

                            @foreach ($paragraphs as $paragraph)
                            <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.65;">
                                {{ $paragraph }}
                            </p>
                            @endforeach

                            <!-- Interview Stage Details -->
                            @if ($status === 'Interview')
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin:24px 0;">
                                <tr>
                                    <td style="padding:14px 18px;border-bottom:1px solid #E2E8F0;">
                                        <p style="margin:0;color:#64748B;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Interview Schedule</p>
                                        <p style="margin:4px 0 0;color:#0F172A;font-size:15px;font-weight:600;">{{ $interviewDate }}</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:14px 18px;">
                                        <p style="margin:0;color:#64748B;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Remarks / Instructions</p>
                                        <p style="margin:4px 0 0;color:#334155;font-size:14px;line-height:1.55;">{{ $interviewRemarks }}</p>
                                    </td>
                                </tr>
                            </table>
                            @endif

                            <!-- Approved Placement Details -->
                            @if ($status === 'Approved')
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;margin:24px 0;">
                                <tr>
                                    <td style="padding:14px 18px;border-bottom:1px solid #BBF7D0;">
                                        <p style="margin:0;color:#166534;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Assigned Department / Office</p>
                                        <p style="margin:4px 0 0;color:#0F172A;font-size:15px;font-weight:700;">{{ $assignedDepartment }}</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:14px 18px;">
                                        <p style="margin:0;color:#166534;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Assigned Duty</p>
                                        <p style="margin:4px 0 0;color:#0F172A;font-size:15px;font-weight:600;">{{ $assignedDuty }}</p>
                                    </td>
                                </tr>
                            </table>
                            @endif

                            <!-- Rejection Reason (if provided) -->
                            @if ($status === 'Rejected' && $rejectionReason !== '')
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FEF2F2;border:1px solid #FECACA;border-radius:8px;margin:24px 0;">
                                <tr>
                                    <td style="padding:14px 18px;">
                                        <p style="margin:0;color:#991B1B;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Evaluation Remarks</p>
                                        <p style="margin:6px 0 0;color:#7F1D1D;font-size:14px;line-height:1.55;">{{ $rejectionReason }}</p>
                                    </td>
                                </tr>
                            </table>
                            @endif

                            <!-- Status Note Callout -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-left:3px solid #D4A017;background-color:#FFFBEB;border-radius:0 6px 6px 0;">
                                <tr>
                                    <td style="padding:12px 16px;">
                                        <p style="margin:0;color:#78350F;font-size:13px;line-height:1.55;">
                                            <strong>Status Note:</strong> {{ $statusNote }}
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Optional Attachment Notice -->
                            @if (is_string($attachmentPdf) && $attachmentPdf !== '')
                            <p style="margin:20px 0 0;color:#475569;font-size:13px;line-height:1.5;">
                                <strong>Attached Document:</strong> {{ $attachmentName ?: 'completed-forms.pdf' }}
                            </p>
                            @endif
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
                                <a href="mailto:{{ $contactEmail }}" style="color:#1D4ED8;text-decoration:none;">{{ $contactEmail }}</a>
                            </p>
                            <p style="margin:10px 0 0;color:#94A3B8;font-size:11px;">
                                This is an automated notification from WoSPIS. Please keep your tracking code for future reference.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>

</html>
