<?php

namespace App\Console\Commands;

use App\Services\MissedDutyLogin;
use App\Services\ShiftClockReminder;
use Illuminate\Console\Command;

class SendShiftClockReminders extends Command
{
    protected $signature = 'shifts:remind';

    protected $description = 'Remind working students about their shifts and flag a duty with no login';

    public function handle(ShiftClockReminder $reminders, MissedDutyLogin $missedLogins): int
    {
        $count = $reminders->dispatch();
        $flagged = $missedLogins->flag();
        $this->info('Sent '.$count.' shift reminder'.($count === 1 ? '' : 's').'.');
        $this->info('Flagged '.$flagged.' missed duty login'.($flagged === 1 ? '' : 's').'.');

        return self::SUCCESS;
    }
}
