import { useEffect, useRef, useState } from 'react';

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

type ClockParts = { hour: string; minute: string; meridiem: 'AM' | 'PM' };

export function parseClockParts(value: string): ClockParts | null {
    const match = String(value || '')
        .trim()
        .match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = match[2];
    const marker = match[3]?.toLowerCase();
    if (marker === 'pm' && hour < 12) hour += 12;
    if (marker === 'am' && hour === 12) hour = 0;
    if (!Number.isFinite(hour) || hour > 23 || Number(minute) > 59) return null;
    return {
        hour: String(hour % 12 || 12),
        minute,
        meridiem: hour >= 12 ? 'PM' : 'AM',
    };
}

export function to24Hour(hour: string, minute: string, meridiem: string): string {
    let next = Number(hour);
    const marker = meridiem.toUpperCase();
    if (marker === 'PM' && next < 12) next += 12;
    if (marker === 'AM' && next === 12) next = 0;
    return `${String(next).padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

interface ClockTimeInputProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
    required?: boolean;
    disabled?: boolean;
    id?: string;
    'aria-label'?: string;
}

/** Hour, minute, and AM/PM. The value stays `HH:mm` so saved times match the API. */
export default function ClockTimeInput({
    value,
    onChange,
    className = '',
    required = false,
    disabled = false,
    id,
    'aria-label': ariaLabel,
}: ClockTimeInputProps) {
    const parsed = parseClockParts(value);
    const [hour, setHour] = useState(parsed?.hour ?? '');
    const [minute, setMinute] = useState(parsed?.minute ?? '');
    const [meridiem, setMeridiem] = useState(parsed?.meridiem ?? '');
    const emitted = useRef(value);

    useEffect(() => {
        if (value === emitted.current) return;
        emitted.current = value;
        const next = parseClockParts(value);
        setHour(next?.hour ?? '');
        setMinute(next?.minute ?? '');
        setMeridiem(next?.meridiem ?? '');
    }, [value]);

    const commit = (nextHour: string, nextMinute: string, nextMeridiem: string) => {
        setHour(nextHour);
        setMinute(nextMinute);
        setMeridiem(nextMeridiem);
        if (!nextHour || !nextMinute || !nextMeridiem) return;
        const nextValue = to24Hour(nextHour, nextMinute, nextMeridiem);
        emitted.current = nextValue;
        onChange(nextValue);
    };

    const selectClass =
        'min-w-0 flex-1 cursor-pointer appearance-none bg-transparent px-0.5 text-center text-inherit outline-none disabled:cursor-not-allowed';

    return (
        <div id={id} className={`inline-flex items-center gap-0.5 ${className}`}>
            <select
                aria-label={ariaLabel ? `${ariaLabel} hour` : 'Hour'}
                required={required}
                disabled={disabled}
                value={hour}
                onChange={(event) => commit(event.target.value, minute, meridiem)}
                className={selectClass}
            >
                <option value="">Hr</option>
                {HOURS.map((item) => (
                    <option key={item} value={item}>
                        {item}
                    </option>
                ))}
            </select>
            <span className="shrink-0 text-slate-400" aria-hidden="true">
                :
            </span>
            <select
                aria-label={ariaLabel ? `${ariaLabel} minute` : 'Minute'}
                required={required}
                disabled={disabled}
                value={minute}
                onChange={(event) => commit(hour, event.target.value, meridiem)}
                className={selectClass}
            >
                <option value="">Min</option>
                {MINUTES.map((item) => (
                    <option key={item} value={item}>
                        {item}
                    </option>
                ))}
            </select>
            <select
                aria-label={ariaLabel ? `${ariaLabel} AM or PM` : 'AM or PM'}
                required={required}
                disabled={disabled}
                value={meridiem}
                onChange={(event) => commit(hour, minute, event.target.value)}
                className={`${selectClass} max-w-[4.25rem]`}
            >
                <option value="">—</option>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
            </select>
        </div>
    );
}
