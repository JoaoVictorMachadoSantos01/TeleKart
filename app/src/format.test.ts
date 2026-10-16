/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDelta, formatLap } from './format.ts';

test('formats lap and delta times', () => {
  assert.equal(formatLap(83456), '1:23.46');
  assert.equal(formatLap(59999), '1:00.00');
  assert.equal(formatLap(null), '–:––.––');
  assert.equal(formatDelta(-420), '-0.42');
  assert.equal(formatDelta(1234), '+1.23');
});
