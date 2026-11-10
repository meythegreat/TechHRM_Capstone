import assert from 'node:assert/strict';
import test from 'node:test';
import { WEEKDAYS, monthCells } from '../src/utils/organizationCalendar.ts';

test('weekday headers start on Sunday', () => {
    assert.deepEqual([...WEEKDAYS], [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
    ]);
});

test('November 2026 places the 1st under Sunday and the 10th under Tuesday', () => {
    const cells = monthCells(new Date(2026, 10, 1));
    const first = cells.findIndex((cell) => cell?.getDate() === 1);
    const tenth = cells.findIndex((cell) => cell?.getDate() === 10);

    assert.equal(WEEKDAYS[first % 7], 'Sunday');
    assert.equal(WEEKDAYS[tenth % 7], 'Tuesday');
    assert.equal(cells[first]?.getDay(), 0);
    assert.equal(cells[tenth]?.getDay(), 2);
});

test('months that start mid-week keep lead padding and trailing nulls', () => {
    // October 2026 starts on Thursday
    const cells = monthCells(new Date(2026, 9, 1));
    const first = cells.findIndex((cell) => cell?.getDate() === 1);

    assert.equal(WEEKDAYS[first % 7], 'Thursday');
    assert.equal(first, 4);
    assert.equal(cells.length % 7, 0);
    assert.equal(cells[0], null);
    assert.ok(cells.at(-1) === null || cells.at(-1) instanceof Date);
});
