<?php

namespace App\Console\Commands;

use App\Services\ShiftClockReminder;
use Illuminate\Console\Command;

class SendShiftClockReminders extends Command
{
    protected $signature = 'shifts:remind';

    protected $description = 'Remind working students to clock in, clock out, and close a forgotten shift';

    public function handle(ShiftClockReminder $reminders): int
    {
        $count = $reminders->dispatch();
        $this->info('Sent '.$count.' shift reminder'.($count === 1 ? '' : 's').'.');

        return self::SUCCESS;
    }
}
