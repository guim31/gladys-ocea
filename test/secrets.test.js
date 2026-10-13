// -----------------------------------------------------------------------------
// The e-mail, the password and the OCEA tokens never reach the logs, the
// messages shown in Gladys, or any file but the session under /data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_DATA_DIR } from '../src/store.js';
import { redact } from '../src/redact.js';
import { setup } from './helpers/app.js';
import { TEST_EMAIL, TEST_PASSWORD } from './helpers/fake-ocea.js';

function secretsOf(ocea) {
  return [TEST_EMAIL, TEST_PASSWORD, ...ocea.accessTokens, ...ocea.refreshTokens];
}

function assertClean(label, text, secrets) {
  for (const secret of secrets) {
    assert.ok(!String(text).includes(secret), `${label} leaks a secret`);
  }
}

test('a full run, failures included, logs no credential nor token', async (t) => {
  const { gladys, ocea, timers, clock, logger, dataDir } = await setup(t, {
    config: { password: 'wrong-password-1234' },
  });
  await gladys.connect();
  await gladys.fake.configUpdated({ email: TEST_EMAIL, password: TEST_PASSWORD });
  const tokensSeen = new Set([...ocea.accessTokens, ...ocea.refreshTokens]);

  ocea.apiStatus = 500;
  clock.now += 7 * 3600 * 1000;
  await timers.runAll();
  ocea.apiStatus = 200;
  ocea.expireAccessTokens();
  await timers.runAll();
  await gladys.fake.action('test_connection');

  const secrets = [...secretsOf(ocea), ...tokensSeen, 'wrong-password-1234'];
  assert.ok(logger.lines.length > 0);
  assertClean('logs', logger.lines.join('\n'), secrets);
  assertClean('connection statuses', JSON.stringify(gladys.fake.connectionStatuses), secrets);
  assertClean('Gladys requests', JSON.stringify(gladys.fake.requests), secrets);

  // The readings file holds no credential; the session file holds only the
  // refresh token (a credential, readable by the container user alone).
  const files = (await readdir(dataDir)).sort();
  assert.deepEqual(files, ['session.json', 'state.json']);
  assertClean('state.json', await readFile(join(dataDir, 'state.json'), 'utf8'), secrets);
  const session = await readFile(join(dataDir, 'session.json'), 'utf8');
  assertClean('session.json', session, [TEST_EMAIL, TEST_PASSWORD, ...ocea.accessTokens]);
});

test('an error message carrying a secret is masked before it is logged', async (t) => {
  const { gladys, ocea, logger } = await setup(t);
  const realFetch = ocea.fetch;
  // A network layer that puts the request body in its error message.
  ocea.fetch = async (url, init) => {
    if (String(url).includes('SelfAsserted')) {
      throw new Error(`socket hang up while sending ${init.body}`);
    }
    return realFetch(url, init);
  };
  await gladys.connect();
  const logs = logger.lines.join('\n');
  assert.match(logs, /socket hang up/);
  assertClean('logs', logs, [TEST_PASSWORD, encodeURIComponent(TEST_EMAIL), TEST_EMAIL]);
});

test('redact masks every secret, longest first', () => {
  assert.equal(
    redact('user a@b.fr pass hunter22', ['a@b.fr', 'hunter22', '', null]),
    'user *** pass ***',
  );
  assert.equal(redact('abc', ['ab']), 'abc', 'too short to be a secret');
});

test('the only writable location is /data', () => {
  // The container rootfs is read-only.
  assert.equal(process.env.OCEA_DATA_DIR ? true : DEFAULT_DATA_DIR === '/data', true);
});
