import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getConfigValue, setConfigValue, getAutoCommitEnabled, getMaxBatchSize } from '../lib/config.js';

describe('Config Module', () => {
  test('getAutoCommitEnabled returns boolean', () => {
    const result = getAutoCommitEnabled();
    assert.strictEqual(typeof result, 'boolean');
  });

  test('getMaxBatchSize returns positive number', () => {
    const result = getMaxBatchSize();
    assert.strictEqual(typeof result, 'number');
    assert.ok(result > 0, 'Batch size should be positive');
    assert.ok(result <= 20, 'Batch size should not exceed 20');
  });
});
