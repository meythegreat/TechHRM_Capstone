import assert from 'node:assert/strict';
import test from 'node:test';
import { assignColumnRoles, shortActionLabel } from '../src/utils/responsiveTables.ts';

test('schedule columns keep the student first, the day and time together, and actions last', () => {
    const roles = assignColumnRoles([
        { label: '', hasCheckbox: true },
        { label: 'Student' },
        { label: 'Day' },
        { label: 'Time' },
        { label: 'Type' },
        { label: 'Details' },
        { label: 'Actions' },
    ]);

    assert.deepEqual(roles, ['select', 'primary', 'day', 'metric', 'badge', 'detail', 'actions']);
});

test('a date-led record promotes the first column when the table has no name column', () => {
    const roles = assignColumnRoles([
        { label: 'Date' },
        { label: 'Time In' },
        { label: 'Time Out' },
        { label: 'Duty Details' },
        { label: 'Status' },
        { label: 'Hours' },
        { label: 'Action' },
    ]);

    assert.deepEqual(roles, ['lead', 'metric', 'metric', 'detail', 'status', 'metric', 'actions']);
});

test('approval controls are treated as the action row, not as another data column', () => {
    const roles = assignColumnRoles([
        { label: 'Student Worker' },
        { label: 'Shift Details' },
        { label: 'Task Description' },
        { label: 'Approval Status' },
    ]);

    assert.deepEqual(roles, ['primary', 'detail', 'detail', 'actions']);
});

test('office names become the card title and hour totals stay measurable', () => {
    assert.deepEqual(
        assignColumnRoles([
            { label: 'Office / Department Name' },
            { label: 'Abbreviation' },
            { label: 'Students' },
            { label: 'Supervisors' },
            { label: 'Actions' },
        ]),
        ['lead', 'metric', 'metric', 'metric', 'actions'],
    );

    assert.equal(
        assignColumnRoles([{ label: 'Student' }, { label: 'DTR' }, { label: 'Grand Total' }, { label: 'At ₱25/hr' }]).at(-1),
        'metric',
    );
});

test('icon-only actions get a short label', () => {
    assert.equal(shortActionLabel('Edit class schedule'), 'Edit');
    assert.equal(shortActionLabel('Remove schedule'), 'Delete');
    assert.equal(shortActionLabel('Edit account'), 'Edit');
    assert.equal(shortActionLabel('Cannot delete: Office is currently assigned to users.'), 'Delete');
    assert.equal(shortActionLabel('View'), 'View');
    assert.equal(shortActionLabel(''), null);
});
