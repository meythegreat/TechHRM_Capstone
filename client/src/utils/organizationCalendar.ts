/** Sunday-first weekday labels for the organization schedule month grid. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * Build a Sunday-first month grid. Leading/trailing cells outside the month are null.
 * `Date#getDay()` already uses Sunday = 0, so lead padding matches that directly.
 */
export function monthCells(cursor: Date): Array<Date | null> {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const lead = first.getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let index = 0; index < lead; index += 1) cells.push(null);
    for (let day = 1; day <= count; day += 1) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}
