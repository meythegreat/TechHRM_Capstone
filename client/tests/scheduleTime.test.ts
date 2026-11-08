import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSchedules, formatScheduleRange, happensNow, startMinutes } from '../src/utils/scheduleTime.ts';

test('schedules sort from morning to evening across 12-hour and 24-hour clocks', () => {
    const rows = [
        { id: 3, student_name: 'Zoe', time: '1:00 PM - 5:00 PM' },
        { id: 2, student_name: 'Ana', time: '13:00 - 17:00' },
        { id: 1, student_name: 'Ben', time: '07:30 - 09:00' },
        { id: 4, student_name: 'Cara', time: '9:15 AM - 11:00 AM' },
    ];

    const ordered = [...rows].sort(compareSchedules).map((row) => row.id);
    assert.deepEqual(ordered, [1, 4, 2, 3]);
    assert.ok(startMinutes('9:15 AM - 11:00 AM') < startMinutes('1:00 PM - 5:00 PM'));
});

test('schedule ranges display in 12-hour time with AM and PM', () => {
    assert.equal(formatScheduleRange('08:00 - 12:00'), '8:00 AM – 12:00 PM');
    assert.equal(formatScheduleRange('13:00 - 17:00'), '1:00 PM – 5:00 PM');
    assert.equal(formatScheduleRange('9:15 AM - 11:00 AM'), '9:15 AM – 11:00 AM');
    assert.equal(formatScheduleRange('10:00 PM - 2:00 AM'), '10:00 PM – 2:00 AM');
});

test('the current clock highlights the class or duty that is in progress', () => {
    const tenAm = 10 * 60;
    assert.equal(happensNow('08:00 - 12:00', tenAm), true);
    assert.equal(happensNow('13:00 - 17:00', tenAm), false);
    assert.equal(happensNow('9:00 AM - 10:30 AM', tenAm), true);
    assert.equal(happensNow('08:00 - 12:00', 12 * 60 + 1), false);
    assert.equal(happensNow('10:00 PM - 2:00 AM', 1 * 60), true);
    assert.equal(happensNow('10:00 PM - 2:00 AM', 23 * 60), true);
    assert.equal(happensNow('10:00 PM - 2:00 AM', 15 * 60), false);
});
