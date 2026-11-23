<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AccountEventMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  list<string>  $paragraphs
     * @param  list<array{label: string, value: string}>  $details
     * @param  list<array{path: string, name: string, mime?: string}>  $files
     */
    public function __construct(
        public string $recipientName,
        public string $subjectLine,
        public string $heading,
        public array $paragraphs,
        public array $details = [],
        public string $notice = '',
        public array $files = [],
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

    /**
     * @return list<Attachment>
     */
    public function attachments(): array
    {
        $attached = [];
        foreach ($this->files as $file) {
            if (! is_file($file['path'])) {
                continue;
            }

            $item = Attachment::fromPath($file['path'])->as($file['name']);
            if (! empty($file['mime'])) {
                $item = $item->withMime($file['mime']);
            }
            $attached[] = $item;
        }

        return $attached;
    }
}
