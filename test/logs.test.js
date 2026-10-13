// -----------------------------------------------------------------------------
// Quiet logs: a normal reading writes nothing atLevels debug; info keeps the
// lifecycle and the user's actions; a failure that repeats writes one line
// when it starts and one when it recovers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers/app.js';
import { TEST_EMAIL, TEST_PASSWORD } from './helpers/fake-ocea.js';

const HOUR = 3600 * 1000;
const atLevels = (lines, ...levels) =>
  lines.filter((line) => levels.some((level) => line.startsWith(`[${level}]`)));

test('normal reading cycles write nothing at info level, and no secret', async (t) => {
  const { gladys, ocea, clock, timers, logger } = await setup(t);
  await gladys.connect();
  assert.deepEqual(atLevels(logger.lines, 'info', 'warn', 'error'), [
    '[info] Connected to OCEA: 1 dwelling(s), 3 meter(s)',
  ]);

  const start = logger.lines.length;
  for (let i = 0; i < 4; i += 1) {
    clock.now += 6 * HOUR;
    await timers.runAll();
  }
  const cycles = logger.lines.slice(start);
  assert.deepEqual(atLevels(cycles, 'info', 'warn', 'error'), [], 'nothing atLevels debug');
  assert.ok(atLevels(cycles, 'debug').length >= 4, 'each reading still traced at debug');

  const secrets = [TEST_EMAIL, TEST_PASSWORD, ...ocea.accessTokens, ...ocea.refreshTokens];
  for (const line of logger.lines) {
    for (const secret of secrets) {
      assert.ok(!line.includes(secret), `a log line leaks a secret: ${line}`);
    }
  }
});

test('a portal down for hours writes one line, and one when it is back', async (t) => {
  const { gladys, ocea, clock, timers, logger } = await setup(t);
  await gladys.connect();
  const start = logger.lines.length;

  ocea.apiStatus = 503;
  for (let i = 0; i < 6; i += 1) {
    clock.now += 6 * HOUR;
    await timers.runAll();
  }
  ocea.apiStatus = 200;
  clock.now += HOUR;
  await timers.runAll();

  const lines = atLevels(logger.lines.slice(start), 'info', 'warn', 'error');
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /^\[error\] OCEA reading failed/);
  assert.match(lines[1], /^\[info\] OCEA reachable again/);
});

test('each user action writes one info line', async (t) => {
  const { gladys, logger } = await setup(t);
  await gladys.connect();
  const start = logger.lines.length;
  await gladys.fake.action('test_connection');
  assert.deepEqual(atLevels(logger.lines.slice(start), 'info', 'warn', 'error'), [
    '[info] Test action: reading OCEA now',
  ]);
});
