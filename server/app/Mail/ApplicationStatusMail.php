<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ApplicationStatusMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  array<string, mixed>  $details
     */
    public function __construct(
        public string $applicantName,
        public string $status,
        public string $trackingCode,
        public array $details = [],
        public ?string $attachmentPdf = null,
        public ?string $attachmentName = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine());
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.application-status',
            with: [
                'heading' => $this->heading(),
                'paragraphs' => $this->paragraphs(),
                'badgeLabel' => $this->badgeLabel(),
                'statusNote' => $this->statusNote(),
                'interviewDate' => $this->interviewDate(),
                'interviewRemarks' => $this->interviewRemarks(),
                'assignedDepartment' => $this->assignedDepartment(),
                'assignedDuty' => $this->assignedDuty(),
                'rejectionReason' => $this->rejectionReason(),
            ],
        );
    }

    /**
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        if (! is_string($this->attachmentPdf) || $this->attachmentPdf === '') {
            return [];
        }

        return [
            Attachment::fromData(
                fn () => $this->attachmentPdf,
                $this->attachmentName ?: 'completed-forms.pdf'
            )->withMime('application/pdf'),
        ];
    }

    public function subjectLine(): string
    {
        return match ($this->status) {
            'Pending' => 'WoSPIS Application Received',
            'Interview' => 'WoSPIS Application — Interview Stage',
            'Training' => 'WoSPIS Application — Training Stage',
            'For Result' => 'WoSPIS Application — Awaiting Final Result',
            'Approved' => 'WoSPIS Application — Approved',
            'Rejected' => 'WoSPIS Application — Application Update',
            default => 'WoSPIS Application Update',
        };
    }

    public function heading(): string
    {
        return match ($this->status) {
            'Pending' => 'Application Successfully Received!',
            'Interview' => 'You Have Moved to the Interview Stage',
            'Training' => 'You Have Moved to the Training Stage',
            'For Result' => 'Your Application Is Awaiting the Final Result',
            'Approved' => 'Congratulations! Your Application Is Approved',
            'Rejected' => 'Application Update',
            default => 'Application Update',
        };
    }

    /**
     * @return array<int, string>
     */
    public function paragraphs(): array
    {
        return match ($this->status) {
            'Pending' => [
                'Thank you for applying to the WoSPIS Work-Study Program at Filamer Christian University.',
                'We are pleased to confirm that your application and submitted documents have been successfully received. Your application will now proceed to the appropriate evaluation process.',
            ],
            'Interview' => [
                'We are pleased to inform you that your application to the WoSPIS Work-Study Program has progressed to the interview stage.',
                'Your application is now being evaluated through the interview process. Please wait for the interview details or follow the instructions below.',
            ],
            'Training' => [
                'We are pleased to inform you that your application to the WoSPIS Work-Study Program has progressed to the training stage.',
                'Please follow any instructions from the Work-Study Program office about your training schedule and requirements. You will receive another notice when there is a further update.',
            ],
            'For Result' => [
                'Your application to the WoSPIS Work-Study Program has completed the required evaluation stages and is now awaiting the final result.',
                'Please wait for the final decision. You will receive another notification once the result is available.',
            ],
            'Approved' => [
                'We are pleased to inform you that your application to the WoSPIS Work-Study Program has been approved.',
                'Your office assignment is below. Please follow the official instructions from the Work-Study Program office. You can sign in with the username or email issued to you.',
            ],
            'Rejected' => [
                'Thank you for your interest in the WoSPIS Work-Study Program and for taking the time to complete the application process.',
                'After evaluation, we regret to inform you that your application has not been approved. We appreciate the effort you invested in your application.',
            ],
            default => [
                'There is an update on your WoSPIS Work-Study Program application.',
            ],
        };
    }

    public function badgeLabel(): string
    {
        return match ($this->status) {
            'For Result' => 'FOR RESULT',
            default => strtoupper($this->status),
        };
    }

    public function statusNote(): string
    {
        return match ($this->status) {
            'Pending' => 'Your application is awaiting evaluation. Please wait for another notification regarding any changes to your application status.',
            'Interview' => 'Your application is in the interview stage. Watch for the schedule and any instructions from the Work-Study office.',
            'Training' => 'Your application has advanced to training. Follow the office schedule and requirements.',
            'For Result' => 'Evaluation is complete. The final decision is still pending.',
            'Approved' => 'Your application is approved and your placement is confirmed.',
            'Rejected' => 'This is the final result of your application.',
            default => 'The Work-Study Program office will send the next update.',
        };
    }

    public function interviewDate(): string
    {
        $date = trim((string) ($this->details['interview_date'] ?? ''));

        return $date !== '' ? $date : 'The Work-Study office will send your schedule.';
    }

    public function interviewRemarks(): string
    {
        $remarks = trim((string) ($this->details['interview_remarks'] ?? ''));

        return $remarks !== '' ? $remarks : 'Please wait for further instructions from the Work-Study Program office.';
    }

    public function assignedDepartment(): string
    {
        $office = trim((string) ($this->details['assigned_department'] ?? ''));

        return $office !== '' ? $office : 'The Work-Study Program office will confirm your placement.';
    }

    public function assignedDuty(): string
    {
        $duty = trim((string) ($this->details['assigned_duty'] ?? ''));

        return $duty !== '' ? $duty : 'To be confirmed';
    }

    public function rejectionReason(): string
    {
        return trim((string) ($this->details['rejection_reason'] ?? ''));
    }
}
