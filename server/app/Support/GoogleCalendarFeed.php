<?php

namespace App\Support;

use App\Http\Controllers\UserController;
use App\Models\Holiday;
use App\Models\Schedule;
use App\Models\SemesterTerm;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * One-way iCalendar export of duty, class, holiday, and class-break rows.
 * TechHRM stays the source of truth. Google Calendar subscribes to the feed.
 */
class GoogleCalendarFeed
{
    private const TIMEZONE = 'Asia/Manila';

    /** @var array<string, int> */
    private const WEEKDAYS = [
        'Sunday' => 0,
        'Monday' => 1,
        'Tuesday' => 2,
        'Wednesday' => 3,
        'Thursday' => 4,
        'Friday' => 5,
        'Saturday' => 6,
    ];

    /** @var array<string, string> */
    private const BYDAY = [
        'Sunday' => 'SU',
        'Monday' => 'MO',
        'Tuesday' => 'TU',
        'Wednesday' => 'WE',
        'Thursday' => 'TH',
        'Friday' => 'FR',
        'Saturday' => 'SA',
    ];

    public function calendarName(User $user, string $scope): string
    {
        if ($scope === 'personal') {
            return 'TechHRM — '.$user->name;
        }

        if ($user->role === 'Supervisor' || $user->role === 'Department Secretary') {
            return 'TechHRM — Assigned students';
        }

        return 'TechHRM — Organization schedule';
    }

    public function render(User $user, string $scope): string
    {
        $host = parse_url((string) config('app.url'), PHP_URL_HOST) ?: 'techhrm';
        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//TechHRM//Schedule//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:'.$this->escape($this->calendarName($user, $scope)),
            'X-WR-TIMEZONE:'.self::TIMEZONE,
            'X-PUBLISHED-TTL:PT1H',
            'BEGIN:VTIMEZONE',
            'TZID:'.self::TIMEZONE,
            'BEGIN:STANDARD',
            'DTSTART:19700101T000000',
            'TZOFFSETFROM:+0800',
            'TZOFFSETTO:+0800',
            'TZNAME:PST',
            'END:STANDARD',
            'END:VTIMEZONE',
        ];

        foreach ($this->apiEvents($user, $scope) as $event) {
            array_push($lines, ...$this->icsEvent($event, $host));
        }

        $lines[] = 'END:VCALENDAR';

        return $this->fold($lines);
    }

    /**
     * @return Collection<int, Schedule>
     */
    public function schedulesFor(User $user, string $scope): Collection
    {
        $query = Schedule::query()->with(['user:id,name', 'user.profile:id,user_id,assigned_office']);

        if ($scope === 'personal') {
            return $query
                ->where('user_id', $user->id)
                ->orderBy('id')
                ->get();
        }

        $query->whereHas('user');
        $officeScoped = $user->role === 'Supervisor' || $user->role === 'Department Secretary';
        if ($officeScoped) {
            $user->loadMissing('profile');
            $areas = app(UserController::class)->supervisedOfficeAreas($user);
            if ($areas === []) {
                $query->whereRaw('0 = 1');
            } else {
                $query->whereHas('user.profile', function ($profile) use ($areas) {
                    $profile->whereIn('assigned_office', $areas);
                });
            }
        }

        return $query->orderBy('id')->get();
    }

    public function scopeFor(User $user): string
    {
        return in_array($user->role, ['Supervisor', 'Department Secretary', 'WSPO Staff', 'Super Admin'], true)
            ? 'assigned'
            : 'personal';
    }

    /**
     * Google Calendar API event bodies for this person's duty, class, and closure calendar.
     *
     * @return list<array<string, mixed>>
     */
    public function apiEvents(User $user, string $scope): array
    {
        [$windowStart, $windowEnd] = $this->window();
        $personal = $scope === 'personal';
        $holidays = Holiday::query()->orderBy('date')->get();
        $events = [];

        foreach ($this->schedulesFor($user, $scope) as $shift) {
            $event = $this->shiftPayload($shift, $windowStart, $windowEnd, $holidays, $personal);
            if ($event !== null) {
                $events[] = $event;
            }
        }

        foreach ($holidays as $holiday) {
            $events[] = $this->holidayPayload($holiday);
        }

        return $events;
    }

    /**
     * @param  Collection<int, Holiday>  $holidays
     * @return array<string, mixed>|null
     */
    private function shiftPayload(Schedule $shift, Carbon $windowStart, Carbon $windowEnd, Collection $holidays, bool $personal): ?array
    {
        $day = (string) $shift->day;
        if (! isset(self::BYDAY[$day])) {
            return null;
        }

        $first = $this->firstWeekday($windowStart, $windowEnd, $day);
        if (! $first) {
            return null;
        }

        $bounds = $this->bounds($shift, $first);
        if (! $bounds) {
            return null;
        }

        [$start, $end] = $bounds;
        $kind = ($shift->kind ?? 'work') === 'class' ? 'class' : 'work';
        $student = trim((string) ($shift->user?->name ?? ''));
        $label = $kind === 'class'
            ? (trim((string) ($shift->subject ?? '')) ?: trim((string) $shift->duty_type) ?: 'Class')
            : (trim((string) $shift->duty_type) ?: 'Duty');
        $summary = $personal || $student === ''
            ? ($kind === 'class' ? 'Class — '.$label : 'Duty — '.$label)
            : ($kind === 'class' ? 'Class — '.$student.' — '.$label : 'Duty — '.$student.' — '.$label);

        $place = $kind === 'class'
            ? trim((string) ($shift->room ?? ''))
            : trim((string) ($shift->department ?? ''));
        $instructor = trim((string) ($shift->instructor ?? ''));
        $description = $kind === 'class'
            ? trim('Class schedule'.($instructor !== '' ? ' with '.$instructor : '').'.')
            : 'Work-study duty'.($place !== '' ? ' at '.$place : '').'.';

        $until = $windowEnd->copy()->timezone('UTC')->format('Ymd\THis\Z');
        $skipped = $this->exdates($first, $windowEnd, $start, $end, $holidays);
        $recurrence = ['RRULE:FREQ=WEEKLY;BYDAY='.self::BYDAY[$day].';UNTIL='.$until];
        if ($skipped !== []) {
            $recurrence[] = 'EXDATE;TZID='.self::TIMEZONE.':'.implode(',', $skipped);
        }

        $event = [
            'id' => 'techhrmschedule'.$shift->id,
            'summary' => $summary,
            'description' => $description,
            'start' => [
                'dateTime' => $start->format('Y-m-d\TH:i:s'),
                'timeZone' => self::TIMEZONE,
            ],
            'end' => [
                'dateTime' => $end->format('Y-m-d\TH:i:s'),
                'timeZone' => self::TIMEZONE,
            ],
            'recurrence' => $recurrence,
        ];
        if ($place !== '') {
            $event['location'] = $place;
        }

        return $event;
    }

    /**
     * @return array<string, mixed>
     */
    private function holidayPayload(Holiday $holiday): array
    {
        $startDate = $holiday->date->copy()->timezone(self::TIMEZONE)->startOfDay();
        $endDate = ($holiday->end_date ?? $holiday->date)->copy()->timezone(self::TIMEZONE)->startOfDay();
        $kind = ($holiday->kind ?: 'holiday') === 'break' ? 'break' : 'holiday';
        $portion = $holiday->portion ?: 'full';
        $name = trim((string) $holiday->name) ?: ($kind === 'break' ? 'Class break' : 'Holiday');
        $summary = ($kind === 'break' ? 'Class break — ' : 'Holiday — ').$name;
        $event = [
            'id' => 'techhrmclosure'.$holiday->id,
            'summary' => $summary,
        ];

        if ($kind === 'holiday' && $portion === 'half' && $holiday->starts_at && $holiday->ends_at) {
            $event['start'] = [
                'dateTime' => $startDate->format('Y-m-d').'T'.$this->clock($holiday->starts_at, true),
                'timeZone' => self::TIMEZONE,
            ];
            $event['end'] = [
                'dateTime' => $startDate->format('Y-m-d').'T'.$this->clock($holiday->ends_at, true),
                'timeZone' => self::TIMEZONE,
            ];
        } else {
            $event['start'] = ['date' => $startDate->format('Y-m-d')];
            $event['end'] = ['date' => $endDate->copy()->addDay()->format('Y-m-d')];
        }

        return $event;
    }

    /**
     * @param  array<string, mixed>  $event
     * @return list<string>
     */
    private function icsEvent(array $event, string $host): array
    {
        $kind = str_starts_with((string) $event['id'], 'techhrmclosure') ? 'holiday' : 'schedule';
        $numericId = preg_replace('/\D/', '', (string) $event['id']);
        $lines = [
            'BEGIN:VEVENT',
            'UID:techhrm-'.$kind.'-'.$numericId.'@'.$host,
            'DTSTAMP:'.$this->stamp(),
        ];

        $start = $event['start'];
        $end = $event['end'];
        if (isset($start['date'])) {
            $lines[] = 'DTSTART;VALUE=DATE:'.str_replace('-', '', (string) $start['date']);
            $lines[] = 'DTEND;VALUE=DATE:'.str_replace('-', '', (string) $end['date']);
        } else {
            $lines[] = 'DTSTART;TZID='.self::TIMEZONE.':'.$this->icsStamp((string) $start['dateTime']);
            $lines[] = 'DTEND;TZID='.self::TIMEZONE.':'.$this->icsStamp((string) $end['dateTime']);
        }

        foreach ($event['recurrence'] ?? [] as $rule) {
            $lines[] = (string) $rule;
        }

        $lines[] = 'SUMMARY:'.$this->escape((string) $event['summary']);
        if (! empty($event['location'])) {
            $lines[] = 'LOCATION:'.$this->escape((string) $event['location']);
        }
        if (! empty($event['description'])) {
            $lines[] = 'DESCRIPTION:'.$this->escape((string) $event['description']);
        }
        $lines[] = 'END:VEVENT';

        return $lines;
    }

    private function icsStamp(string $dateTime): string
    {
        return str_replace(['-', ':'], '', $dateTime);
    }

    /**
     * Dates inside the semester where the in-app calendar hides this shift.
     *
     * @param  Collection<int, Holiday>  $holidays
     * @return list<string>
     */
    private function exdates(Carbon $first, Carbon $windowEnd, Carbon $shiftStart, Carbon $shiftEnd, Collection $holidays): array
    {
        $dates = [];
        $cursor = $first->copy()->startOfDay();
        $last = $windowEnd->copy()->startOfDay();
        $startMinutes = ($shiftStart->hour * 60) + $shiftStart->minute;
        $endMinutes = ($shiftEnd->hour * 60) + $shiftEnd->minute;
        if ($shiftEnd->toDateString() !== $shiftStart->toDateString()) {
            $endMinutes += 24 * 60;
        }

        while ($cursor->lte($last)) {
            if ($this->blocked($cursor, $startMinutes, $endMinutes, $holidays)) {
                $dates[] = $cursor->format('Ymd').'T'.$shiftStart->format('His');
            }
            $cursor->addWeek();
        }

        return $dates;
    }

    /**
     * @param  Collection<int, Holiday>  $holidays
     */
    private function blocked(Carbon $day, int $shiftStart, int $shiftEnd, Collection $holidays): bool
    {
        $key = $day->toDateString();

        foreach ($holidays as $holiday) {
            $start = $holiday->date->toDateString();
            $end = ($holiday->end_date ?? $holiday->date)->toDateString();
            if ($key < $start || $key > $end) {
                continue;
            }

            $fullClosure = ($holiday->kind ?: 'holiday') === 'break' || ($holiday->portion ?: 'full') !== 'half';
            if ($fullClosure) {
                return true;
            }

            $blockStart = $this->minutes($holiday->starts_at);
            $blockEnd = $this->minutes($holiday->ends_at);
            if ($blockStart === null || $blockEnd === null) {
                return true;
            }

            if ($shiftStart < $blockEnd && $blockStart < $shiftEnd) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function window(): array
    {
        $semester = SemesterTerm::current();
        if ($semester) {
            return [
                Carbon::parse($semester->starts_on->toDateString(), self::TIMEZONE)->startOfDay(),
                Carbon::parse($semester->ends_on->toDateString(), self::TIMEZONE)->endOfDay(),
            ];
        }

        $start = Carbon::now(self::TIMEZONE)->startOfDay();

        return [$start, $start->copy()->addMonthsNoOverflow(5)->endOfDay()];
    }

    /**
     * @return array{0: Carbon, 1: Carbon}|null
     */
    private function bounds(Schedule $shift, Carbon $day): ?array
    {
        $parts = preg_split('/\s*-\s*/', trim((string) $shift->time)) ?: [];
        if (count($parts) !== 2) {
            return null;
        }

        try {
            $start = Carbon::parse($day->toDateString().' '.trim($parts[0]), self::TIMEZONE);
            $end = Carbon::parse($day->toDateString().' '.trim($parts[1]), self::TIMEZONE);
        } catch (\Throwable) {
            return null;
        }

        if ($end->lte($start)) {
            $end->addDay();
        }

        return [$start, $end];
    }

    private function firstWeekday(Carbon $windowStart, Carbon $windowEnd, string $day): ?Carbon
    {
        $cursor = $windowStart->copy()->timezone(self::TIMEZONE)->startOfDay();
        $delta = (self::WEEKDAYS[$day] - $cursor->dayOfWeek + 7) % 7;
        $cursor->addDays($delta);
        if ($cursor->gt($windowEnd)) {
            return null;
        }

        return $cursor;
    }

    private function minutes(mixed $value): ?int
    {
        $raw = substr(trim((string) $value), 0, 5);
        if (! preg_match('/^(\d{2}):(\d{2})$/', $raw, $match)) {
            return null;
        }

        return ((int) $match[1] * 60) + (int) $match[2];
    }

    private function clock(mixed $value, bool $colon = false): string
    {
        $raw = substr(trim((string) $value), 0, 5);
        if ($colon) {
            return $raw.':00';
        }

        return str_replace(':', '', $raw).'00';
    }

    private function stamp(): string
    {
        return Carbon::now('UTC')->format('Ymd\THis\Z');
    }

    private function escape(string $value): string
    {
        $value = str_replace(["\\", "\r\n", "\n", "\r"], ["\\\\", ' ', ' ', ' '], $value);

        return str_replace([',', ';'], ['\\,', '\\;'], $value);
    }

    /**
     * @param  list<string>  $lines
     */
    private function fold(array $lines): string
    {
        $folded = [];
        foreach ($lines as $line) {
            $folded[] = $this->foldLine($line);
        }

        return implode("\r\n", $folded)."\r\n";
    }

    private function foldLine(string $line): string
    {
        if (strlen($line) <= 73) {
            return $line;
        }

        $parts = [substr($line, 0, 73)];
        $rest = substr($line, 73);
        while (strlen($rest) > 72) {
            $parts[] = ' '.substr($rest, 0, 72);
            $rest = substr($rest, 72);
        }
        if ($rest !== '') {
            $parts[] = ' '.$rest;
        }

        return implode("\r\n", $parts);
    }
}
