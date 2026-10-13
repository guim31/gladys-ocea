// -----------------------------------------------------------------------------
// Conformance with the Gladys core: every device the integration can publish
// is checked against the core's table of category/type couples, units and
// poll frequencies (test/fixtures/gladys-feature-table.json). A failure here
// is a device Gladys would refuse or draw wrong: fix the device, not the test.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildDevice } from '../src/devices.js';
import { parseConsumptions } from '../src/ocea/parse.js';
import { LANGUAGES } from '../src/i18n.js';
import { fixture } from './helpers/fake-ocea.js';

const table = JSON.parse(
  readFileSync(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);
const gladys = createFakeGladys();

// Every shape of answer the fixtures cover, plus fluids nobody has reported.
const CONSOS = [
  fixture('consos-water.json'),
  fixture('consos-cetc.json'),
  fixture('consos-allocators.json'),
  [
    { fluide: 'Cetc', valeur: '1,5', unite: 'MWh' },
    { fluide: 'Chauffage', valeur: '12', unite: 'U' },
    { fluide: 'EauPluviale', valeur: '3', unite: 'm³' },
    { fluide: 'Inconnu', valeur: '3', unite: '' },
  ],
];

const devices = LANGUAGES.flatMap((language) =>
  CONSOS.map((consos, index) =>
    buildDevice(
      gladys,
      { id: `dwelling-${index}`, label: `Label ${index}`, readings: parseConsumptions(consos) },
      { language, multiple: index % 2 === 0 },
    ),
  ),
);
const features = devices.flatMap((device) => device.features);

test('every category/type couple is one the core knows and draws', () => {
  for (const feature of features) {
    const pair = `${feature.category}/${feature.type}`;
    assert.ok(table.categories.includes(feature.category), `unknown category ${feature.category}`);
    assert.ok(table.types.includes(feature.type), `unknown type ${feature.type}`);
    assert.ok(table.pairs[pair], `couple ${pair} is not in the core table`);
  }
});

test('polling: should_poll is a boolean, poll_frequency in ms from the fixed list', () => {
  for (const device of devices) {
    assert.equal(typeof device.should_poll, 'boolean', `${device.external_id}: should_poll`);
    if (device.should_poll || device.poll_frequency !== undefined) {
      assert.ok(
        table.poll_frequencies_ms.includes(device.poll_frequency),
        `${device.external_id}: poll_frequency ${device.poll_frequency} is not in the list (ms)`,
      );
    }
    // Readings move a few times a day: never polled by Gladys.
    assert.equal(device.should_poll, false);
  }
});

test('min and max are numbers on every feature', () => {
  for (const feature of features) {
    assert.equal(typeof feature.min, 'number', `${feature.external_id}: min`);
    assert.equal(typeof feature.max, 'number', `${feature.external_id}: max`);
    assert.ok(Number.isFinite(feature.min) && Number.isFinite(feature.max));
    assert.ok(feature.min < feature.max, `${feature.external_id}: min < max`);
  }
});

test('read_only and has_feedback are booleans', () => {
  for (const feature of features) {
    assert.equal(typeof feature.read_only, 'boolean', `${feature.external_id}: read_only`);
    assert.equal(typeof feature.has_feedback, 'boolean', `${feature.external_id}: has_feedback`);
    assert.equal(typeof feature.keep_history, 'boolean', `${feature.external_id}: keep_history`);
  }
});

test('units are known to the core, and allowed for their category', () => {
  for (const feature of features) {
    if (feature.unit === null || feature.unit === undefined) {
      continue;
    }
    assert.ok(
      table.units.includes(feature.unit),
      `${feature.external_id}: unknown unit ${feature.unit}`,
    );
    const allowed = table.units_by_category[feature.category];
    if (allowed) {
      assert.ok(
        allowed.flat().includes(feature.unit),
        `${feature.external_id}: ${feature.unit} not allowed for ${feature.category}`,
      );
    }
  }
});

test('external ids are unique, and built with the selector prefix', () => {
  const ids = [...devices.map((d) => d.external_id), ...features.map((f) => f.external_id)];
  const perLanguage = ids.length / LANGUAGES.length;
  // The same dwelling gives the same ids in every language.
  assert.equal(new Set(ids).size, perLanguage);
  for (const device of devices.slice(0, CONSOS.length)) {
    const featureIds = device.features.map((f) => f.external_id);
    assert.equal(
      new Set(featureIds).size,
      featureIds.length,
      `${device.external_id}: duplicate feature`,
    );
    for (const id of [device.external_id, ...featureIds]) {
      assert.ok(id.startsWith('ext:test-integration:dwelling:'), id);
    }
  }
});

test('the core turns the heat meter into consumption, and only it', () => {
  // energy-sensor/index is the index the core's energy monitoring derives a
  // 30-minute consumption from; allocator units must never reach it.
  const energy = features.filter((f) => f.category === 'energy-sensor');
  assert.ok(energy.length > 0);
  for (const feature of energy) {
    assert.equal(feature.type, 'index');
    assert.ok(['watt-hour', 'kilowatt-hour', 'megawatt-hour'].includes(feature.unit));
  }
  for (const feature of features.filter((f) => f.category === 'counter-sensor')) {
    assert.equal(feature.unit, null, 'allocator units have no physical unit');
  }
});

test('the fake Gladys accepts every device (the host API checks)', async () => {
  const fake = createFakeGladys();
  await fake.connect();
  await fake.publishDiscoveredDevices(devices.slice(0, CONSOS.length));
  assert.equal(fake.fake.discoveredDevices.length, CONSOS.length);
});
