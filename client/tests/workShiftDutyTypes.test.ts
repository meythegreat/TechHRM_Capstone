import assert from 'node:assert/strict';
import test from 'node:test';
import { WORK_SHIFT_DUTY_TYPES, workShiftDutyOptions } from '../src/constants/workShiftDutyTypes.ts';

test('assigning a new shift offers Janitorial as a duty type', () => {
    assert.ok(WORK_SHIFT_DUTY_TYPES.includes('Janitorial'));
    assert.deepEqual(workShiftDutyOptions(), [
        'Clerical Work',
        'Library Assistant',
        'Lab Assistant',
        'Cleaning',
        'Janitorial',
        'Event Setup',
    ]);
});

test('editing a shift keeps a duty type that is not in the preset list', () => {
    const options = workShiftDutyOptions('Legacy Desk');
    assert.ok(options.includes('Janitorial'));
    assert.ok(options.includes('Legacy Desk'));
    assert.equal(options.filter((duty) => duty === 'Janitorial').length, 1);
});
