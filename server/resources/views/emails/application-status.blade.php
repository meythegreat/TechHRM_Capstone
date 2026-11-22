<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WoSPIS Application Update</title>
</head>
<body style="margin:0;padding:0;background-color:#FFD500;font-family:Arial,Helvetica,sans-serif;color:#000000;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFD500;padding:35px 12px;">
    <tr>
        <td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#FFFFFF;border:2px solid #102179;border-radius:16px;overflow:hidden;">
                <tr>
                    <td align="center" style="background-color:#102179;padding:32px 24px 28px;">
                        <h1 style="margin:0 0 6px;font-size:28px;line-height:1.3;font-weight:800;color:#FFFFFF;letter-spacing:1px;">WoSPIS</h1>
                        <p style="margin:0;font-size:13px;line-height:1.6;color:#4AECED;letter-spacing:1.5px;text-transform:uppercase;">Work-Study Program</p>
                    </td>
                </tr>
                <tr>
                    <td height="5" style="background-color:#CC1E1B;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                    <td style="padding:35px 32px 20px;">
                        <p style="margin:0 0 18px;font-size:16px;line-height:1.7;">Dear <strong style="color:#102179;">{{ $applicantName }}</strong>,</p>
                        <h2 style="margin:0 0 16px;font-size:23px;line-height:1.4;color:#102179;">{{ $heading }}</h2>
                        @foreach ($paragraphs as $paragraph)
                            <p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#333333;">{{ $paragraph }}</p>
                        @endforeach
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F4F7FF;border:1px solid #D6DFF8;border-left:5px solid #FFD500;border-radius:8px;">
                            <tr>
                                <td style="padding:22px 20px;">
                                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#102179;text-transform:uppercase;letter-spacing:1.2px;">Current Application Status</p>
                                    <p style="margin:0;font-size:14px;font-weight:800;color:#102179;letter-spacing:1px;">{{ $badgeLabel }}</p>
                                    <p style="margin:15px 0 0;font-size:13px;line-height:1.7;color:#444444;">{{ $statusNote }}</p>
                                </td>
                            </tr>
                        </table>
                        @if ($status === 'Interview')
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;background-color:#FFF8E8;border:1px solid #FFD500;border-radius:8px;">
                                <tr>
                                    <td style="padding:18px 20px;">
                                        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#102179;text-transform:uppercase;letter-spacing:1.2px;">Interview Schedule</p>
                                        <p style="margin:0;font-size:15px;line-height:1.7;font-weight:700;color:#102179;">{{ $interviewDate }}</p>
                                        <p style="margin:8px 0 0;font-size:13px;line-height:1.7;color:#444444;">{{ $interviewRemarks }}</p>
                                    </td>
                                </tr>
                            </table>
                        @endif
                        @if ($status === 'Approved')
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;background-color:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;">
                                <tr>
                                    <td style="padding:18px 20px;">
                                        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#065F46;text-transform:uppercase;letter-spacing:1.2px;">Office Assignment</p>
                                        <p style="margin:0;font-size:16px;line-height:1.6;font-weight:800;color:#102179;">{{ $assignedDepartment }}</p>
                                        <p style="margin:6px 0 0;font-size:14px;line-height:1.6;color:#333333;">Duty: {{ $assignedDuty }}</p>
                                    </td>
                                </tr>
                            </table>
                        @endif
                        @if ($status === 'Rejected' && $rejectionReason !== '')
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;background-color:#FEF2F2;border:1px solid #FECACA;border-radius:8px;">
                                <tr>
                                    <td style="padding:18px 20px;">
                                        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#CC1E1B;text-transform:uppercase;letter-spacing:1.2px;">Reason</p>
                                        <p style="margin:0;font-size:15px;line-height:1.7;color:#333333;">{{ $rejectionReason }}</p>
                                    </td>
                                </tr>
                            </table>
                        @endif
                        @if ($status !== 'Rejected')
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px;background-color:#102179;border-radius:10px;">
                                <tr>
                                    <td align="center" style="padding:23px 18px;">
                                        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#4AECED;letter-spacing:1.5px;text-transform:uppercase;">Your Application Tracking Code</p>
                                        <p style="margin:0 0 12px;font-size:23px;line-height:1.5;font-weight:800;color:#FFD500;letter-spacing:2px;">{{ $trackingCode }}</p>
                                        <p style="margin:0;font-size:12px;line-height:1.7;color:#FFFFFF;">Keep this code safe. You can use it with your email to track your application status.</p>
                                    </td>
                                </tr>
                            </table>
                        @endif
                        <p style="margin:25px 0 4px;font-size:14px;color:#333333;">Sincerely,</p>
                        <p style="margin:0;font-size:16px;font-weight:800;color:#102179;">WoSPIS</p>
                        <p style="margin:3px 0;font-size:13px;color:#555555;">Work-Study Program</p>
                        <p style="margin:3px 0 0;font-size:13px;font-weight:700;color:#102179;">Filamer Christian University</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
