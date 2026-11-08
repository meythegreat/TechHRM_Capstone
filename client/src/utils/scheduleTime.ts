/** Minutes from midnight for the first clock time in a schedule range. Unparsed times sort last. */
export function startMinutes(time: string): number {
    const match = String(time || '').match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!match) return 24 * 60;
    return clockToMinutes(Number(match[1]), Number(match[2]), match[3]);
}

/** Inclusive [start, end] in minutes. An end at or before the start rolls into the next day. */
export function shiftWindow(time: string): [number, number] | null {
    const matches = [...String(time || '').matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)?/gi)];
    if (matches.length < 2) return null;
    const start = clockToMinutes(Number(matches[0][1]), Number(matches[0][2]), matches[0][3]);
    let end = clockToMinutes(Number(matches[1][1]), Number(matches[1][2]), matches[1][3]);
    if (end <= start) end += 24 * 60;
    return [start, end];
}

/** True when `minutes` (0–1439, local clock) falls inside the shift, including overnight ranges. */
export function happensNow(time: string, minutes: number): boolean {
    const window = shiftWindow(time);
    if (!window) return false;
    const [start, end] = window;
    const point = minutes < start && end > 24 * 60 ? minutes + 24 * 60 : minutes;
    return point >= start && point <= end;
}

export function formatMinutes(total: number): string {
    const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    const hour24 = Math.floor(normalized / 60);
    const minute = normalized % 60;
    const meridiem = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

export function formatShiftStart(time: string): string {
    const window = shiftWindow(time);
    if (!window) return String(time || '').trim() || '—';
    return formatMinutes(window[0]);
}

export function formatShiftEnd(time: string): string {
    const window = shiftWindow(time);
    if (!window) return '';
    return formatMinutes(window[1]);
}

/** Display a stored shift range as 12-hour start – end with AM/PM. */
export function formatScheduleRange(time: string): string {
    const start = formatShiftStart(time);
    const end = formatShiftEnd(time);
    if (!end) return start;
    return `${start} – ${end}`;
}

export function compareSchedules<T extends { time: string; student_name?: string; id?: number }>(left: T, right: T): number {
    const byTime = startMinutes(left.time) - startMinutes(right.time);
    if (byTime !== 0) return byTime;
    const byName = (left.student_name || '').localeCompare(right.student_name || '');
    if (byName !== 0) return byName;
    return (left.id || 0) - (right.id || 0);
}

function clockToMinutes(hour: number, minute: number, meridiem?: string): number {
    let nextHour = hour;
    const marker = meridiem?.toLowerCase();
    if (marker === 'pm' && nextHour < 12) nextHour += 12;
    if (marker === 'am' && nextHour === 12) nextHour = 0;
    return nextHour * 60 + minute;
}
