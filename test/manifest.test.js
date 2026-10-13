// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import {
  DEFAULT_CONFIG,
  MAX_REFRESH_HOURS,
  MIN_REFRESH_HOURS,
  normalizeConfig,
} from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { WIDGET_KEYS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const field = (key) => manifest.config_schema.find((f) => f.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

test('identity: name, category, transport, image', () => {
  assert.equal(manifest.name, 'OCEA Smart Building');
  assert.deepEqual(manifest.categories, ['energy']);
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.equal(manifest.type, 'device');
  assert.ok(manifest.docker_image.startsWith('ghcr.io/guim31/gladys-ocea:'));
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/guim31\/gladys-ocea\//,
  );
});

test('widgets require Gladys >= 5.1.0, no scene trigger nor action is declared', () => {
  const [major, minor] = minGladysVersion();
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
  // No trigger invented: OCEA gives no alert to forward.
  assert.equal(manifest.scene_triggers, undefined);
  assert.equal(manifest.scene_actions, undefined);
});

test('every manifest action, and every widget, has a handler, and vice versa', async () => {
  const gladys = createFakeGladys({ config: {} });
  createApp(gladys, {
    fetch: async () => new Response('', { status: 500 }),
    dataDir: '/nonexistent',
  });
  const ack = await gladys.fake.action('test_connection');
  assert.equal(ack.success, true, 'test_connection is handled');
  assert.deepEqual(keysOf(manifest.actions), ['test_connection']);
  assert.deepEqual(keysOf(manifest.widgets), WIDGET_KEYS);
  for (const key of WIDGET_KEYS) {
    assert.equal((await gladys.fake.widgetGet(key, { settings: {} })).success, true, key);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const f of manifest.config_schema) {
    if (f.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[f.key], f.default, `DEFAULT_CONFIG.${f.key}`);
    }
  }
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    assert.ok(field(key), `config key ${key} is declared in the manifest`);
  }
});

test('the reading interval is 6 hours by default, 1 to 24 hours', () => {
  const hours = field('refresh_hours');
  assert.equal(hours.type, 'number');
  assert.equal(hours.default, 6);
  assert.equal(hours.min, MIN_REFRESH_HOURS);
  assert.equal(hours.max, MAX_REFRESH_HOURS);
  // Number fields are rendered without `step`: integers only.
  assert.ok([hours.default, hours.min, hours.max].every(Number.isInteger));
  assert.equal(normalizeConfig({ refresh_hours: '0' }).refresh_hours, 1);
  assert.equal(normalizeConfig({ refresh_hours: 'abc' }).refresh_hours, 6);
});

test('the password is a secret, and the language select offers the four languages', () => {
  assert.equal(field('password').type, 'secret');
  assert.equal(field('password').default, undefined);
  assert.deepEqual(
    field('language').options.map((o) => o.value),
    LANGUAGES,
  );
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('the non-affiliation is stated in the configuration screen', () => {
  const intro = field('intro');
  assert.match(intro.description.en, /Not affiliated with OCEA Smart Building/);
  assert.match(intro.description.fr, /Sans lien avec OCEA Smart Building/);
});

test('dynamic selects declare a source and no static options', () => {
  const settings = manifest.widgets.flatMap((w) => w.settings ?? []);
  for (const f of settings.filter((s) => s.source !== undefined)) {
    assert.equal(f.source, 'devices');
    assert.equal(f.options, undefined);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: never edited by hand.
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('field placeholders are multi-language objects', () => {
  for (const f of manifest.config_schema.filter((x) => x.placeholder !== undefined)) {
    assert.equal(typeof f.placeholder, 'object');
    assert.ok(f.placeholder.en);
  }
});
