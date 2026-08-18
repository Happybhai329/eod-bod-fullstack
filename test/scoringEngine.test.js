import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePerformance,
  calculateFinalScore,
  clampNumber,
  parseScoreHelper,
  getSafeNonNegativeNumber
} from '../server/scoringEngine.js';

test('clampNumber helper', () => {
  assert.equal(clampNumber(50, 0, 100, 0), 50);
  assert.equal(clampNumber(-10, 0, 100, 0), 0);
  assert.equal(clampNumber(150, 0, 100, 0), 100);
  assert.equal(clampNumber('invalid', 0, 100, 25), 25);
  assert.equal(clampNumber(null, 0, 100, 10), 10);
});

test('parseScoreHelper helper', () => {
  assert.equal(parseScoreHelper(85), 85);
  assert.equal(parseScoreHelper('92%'), 92);
  assert.equal(parseScoreHelper('0.85'), 85);
  assert.equal(parseScoreHelper(''), 0);
  assert.equal(parseScoreHelper(null), 0);
  assert.equal(parseScoreHelper(250, 200), 200);
});

test('getSafeNonNegativeNumber helper', () => {
  assert.equal(getSafeNonNegativeNumber(15), 15);
  assert.equal(getSafeNonNegativeNumber(-5, 0), 0);
  assert.equal(getSafeNonNegativeNumber('42'), 42);
  assert.equal(getSafeNonNegativeNumber(null, 10), 10);
  assert.equal(getSafeNonNegativeNumber('abc', 5), 5);
});

test('calculatePerformance with numeric tasks', () => {
  const bod = {
    calls: { value: 40, type: 'number' },
    demos: { value: 5, type: 'number' }
  };
  const eod = {
    calls: { value: 40, type: 'number' },
    demos: { value: 5, type: 'number' }
  };
  assert.equal(calculatePerformance(bod, eod), 100);

  const eodPartial = {
    calls: { value: 20, type: 'number' }, // 50%
    demos: { value: 5, type: 'number' }  // 100%
  };
  assert.equal(calculatePerformance(bod, eodPartial), 75);

  const eodOverachieved = {
    calls: { value: 60, type: 'number' }, // 100% clamped
    demos: { value: 5, type: 'number' }   // 100%
  };
  assert.equal(calculatePerformance(bod, eodOverachieved), 100);
});

test('calculatePerformance with checkbox tasks', () => {
  const bod = {
    task1: { status: 'Pending', type: 'checkbox' },
    task2: { status: 'Pending', type: 'checkbox' }
  };
  const eod = {
    task1: { status: 'Done', type: 'checkbox' },
    task2: { status: 'Pending', type: 'checkbox' }
  };
  // Task 1: 100%, Task 2: 0% -> Avg: 50%
  assert.equal(calculatePerformance(bod, eod), 50);

  const eodAllDone = {
    task1: { status: 'Done', type: 'checkbox' },
    task2: { status: 'Done', type: 'checkbox' }
  };
  assert.equal(calculatePerformance(bod, eodAllDone), 100);
});

test('calculatePerformance with dynamic lists and voluntary tasks', () => {
  const bod = {
    listTask: {
      type: 'dynamicList',
      list: [
        { text: 'Mandatory 1', hasTarget: true, target: 10, achieved: 0, isVoluntary: false },
        { text: 'Mandatory 2', hasTarget: false, status: 'Pending', isVoluntary: false }
      ]
    }
  };
  const eod = {
    listTask: {
      type: 'dynamicList',
      list: [
        { text: 'Mandatory 1', hasTarget: true, target: 10, achieved: 10, isVoluntary: false },
        { text: 'Mandatory 2', hasTarget: false, status: 'Done', isVoluntary: false },
        { text: 'Bonus Voluntary', hasTarget: true, target: 5, achieved: 5, isVoluntary: true }
      ]
    }
  };
  // Target sum = 10 + 1 = 11. Achieved sum = 10 + 1 + 5 = 16.
  // 16/11 > 100% -> clamped to 100%
  assert.equal(calculatePerformance(bod, eod), 100);
});

test('calculatePerformance with categoryNumber tasks', () => {
  const bod = {
    categorized: {
      type: 'categoryNumber',
      value: 50,
      subCategories: { Inbound: 25, Outbound: 25 }
    }
  };
  const eod = {
    categorized: {
      type: 'categoryNumber',
      subCategories: { Inbound: 25, Outbound: 15 } // 40 achieved out of 50 target = 80%
    }
  };
  assert.equal(calculatePerformance(bod, eod), 80);
});

test('calculatePerformance handles edge cases gracefully', () => {
  assert.equal(calculatePerformance(null, null), 0);
  assert.equal(calculatePerformance({}, {}), 0);
  assert.equal(calculatePerformance(null, { invalid: 'notAnObject' }), 0);
});

test('calculateFinalScore calculation and clamp boundaries', () => {
  // System score 80%, Head Rating 100% -> 80%
  assert.equal(calculateFinalScore(80, 100), 80);

  // System score 80%, Head Rating 125% -> 100%
  assert.equal(calculateFinalScore(80, 125), 100);

  // System score 90%, Head Rating 150% -> 135%
  assert.equal(calculateFinalScore(90, 150), 135);

  // System score 100%, Head Rating 200% -> 200%
  assert.equal(calculateFinalScore(100, 200), 200);

  // System score 80%, Head Rating 0% -> 0%
  assert.equal(calculateFinalScore(80, 0), 0);

  // Head rating above 200 clamped to 200
  assert.equal(calculateFinalScore(100, 250), 200);

  // Fallback defaults on null/undefined
  assert.equal(calculateFinalScore(null, null), 0);
});
