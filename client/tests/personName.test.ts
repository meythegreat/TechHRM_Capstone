import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDisplayName,
  middleInitial,
  normalizeAbbreviation,
  parseFullName,
} from '../src/utils/personName.ts';

test('middle initial and display name keep multi-word surnames intact', () => {
  assert.equal(middleInitial('Marie'), 'M.');
  assert.equal(middleInitial('m'), 'M.');
  assert.equal(middleInitial('M.'), 'M.');
  assert.equal(formatDisplayName('Quia', 'M', 'De Felipe'), 'Quia M. De Felipe');
  assert.equal(formatDisplayName('Quia', null, 'De Felipe'), 'Quia De Felipe');
  assert.equal(formatDisplayName('Juan', 'Carlos', 'De la Cruz', 'Mr'), 'Mr. Juan C. De la Cruz');
});

test('parseFullName keeps surname particles with the last name', () => {
  assert.deepEqual(parseFullName('Quia M. De Felipe'), {
    prefix: '',
    first_name: 'Quia',
    middle_initial: 'M.',
    last_name: 'De Felipe',
  });

  assert.deepEqual(parseFullName('Quia De Felipe'), {
    prefix: '',
    first_name: 'Quia',
    middle_initial: '',
    last_name: 'De Felipe',
  });

  assert.deepEqual(parseFullName('Ms. Ana Del Rosario'), {
    prefix: 'Ms.',
    first_name: 'Ana',
    middle_initial: '',
    last_name: 'Del Rosario',
  });

  assert.deepEqual(parseFullName('Juan Carlos De la Cruz'), {
    prefix: '',
    first_name: 'Juan',
    middle_initial: 'C.',
    last_name: 'De la Cruz',
  });

  assert.deepEqual(parseFullName('Maria Dela Cruz'), {
    prefix: '',
    first_name: 'Maria',
    middle_initial: '',
    last_name: 'Dela Cruz',
  });

  assert.deepEqual(parseFullName('Pieter Van Der Berg'), {
    prefix: '',
    first_name: 'Pieter',
    middle_initial: '',
    last_name: 'Van Der Berg',
  });

  assert.deepEqual(parseFullName('Dr. Jose P. Rizal'), {
    prefix: 'Dr.',
    first_name: 'Jose',
    middle_initial: 'P.',
    last_name: 'Rizal',
  });
});

test('normalizeAbbreviation always ends with a single period', () => {
  assert.equal(normalizeAbbreviation('M'), 'M.');
  assert.equal(normalizeAbbreviation('M.'), 'M.');
  assert.equal(normalizeAbbreviation('Mr..'), 'Mr.');
  assert.equal(normalizeAbbreviation(''), '');
});
