export const WORK_SHIFT_DUTY_TYPES = [
    'Clerical Work',
    'Library Assistant',
    'Lab Assistant',
    'Cleaning',
    'Janitorial',
    'Event Setup',
] as const;

/** Duty types offered when assigning or editing a work shift. */
export function workShiftDutyOptions(current = ''): string[] {
    const options: string[] = [...WORK_SHIFT_DUTY_TYPES];
    const duty = current.trim();
    if (duty && !options.includes(duty)) {
        options.push(duty);
    }
    return options;
}
