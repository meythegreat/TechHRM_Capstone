export interface StudentActivityItem {
    id: number;
    kind: 'meeting_assembly' | 'devotional' | 'daily_cleaning' | 'general_cleaning' | string;
    kind_label: string;
    title: string;
    event_date: string;
    day: string;
    starts_at: string | null;
    ends_at: string | null;
    valid_until: string | null;
    hours: number;
    is_campus_wide: boolean;
    group_name: string | null;
    year_level: number | null;
    year_label: string | null;
    audience_label: string;
    notes: string | null;
    attendance_status: 'pending' | 'timed_in' | 'on_time' | 'late' | 'absent' | string;
    time_in: string | null;
    time_out: string | null;
    is_today: boolean;
    is_happening_now: boolean;
    is_starting_soon: boolean;
    has_ended: boolean;
    timing: 'ongoing' | 'starting_soon' | 'today' | 'upcoming' | 'past' | string;
}
