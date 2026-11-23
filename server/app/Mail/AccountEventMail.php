<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AccountEventMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  list<string>  $paragraphs
     * @param  list<array{label: string, value: string}>  $details
     */
    public function __construct(
        public string $recipientName,
        public string $subjectLine,
        public string $heading,
        public array $paragraphs,
        public array $details = [],
        public string $notice = '',
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.account-event',
            with: [
                'recipientName' => $this->recipientName,
                'heading' => $this->heading,
                'paragraphs' => $this->paragraphs,
                'details' => $this->details,
                'notice' => $this->notice,
            ],
        );
    }
}
