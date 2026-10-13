import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { RETRY_DELAY_MS } from '../src/app.js';
import { DEVICE_ID, DWELLING_ID, setup } from './helpers/app.js';
import { fixture } from './helpers/fake-ocea.js';

const HOUR = 3600 * 1000;

test('connecting reads OCEA and publishes one device per dwelling', async (t) => {
  const { gladys, timers } = await setup(t);
  await gladys.connect();

  const [device] = gladys.fake.discoveredDevices;
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.equal(device.external_id, DEVICE_ID);
  assert.equal(device.name, 'OCEA Smart Building');
  assert.equal(device.should_poll, false);
  assert.deepEqual(
    device.features.map((f) => [f.name, f.category, f.type, f.unit]),
    [
      ['Eau froide', 'volume-sensor', 'decimal', 'cubicmeter'],
      ['Eau chaude', 'volume-sensor', 'decimal', 'cubicmeter'],
      ['Chauffage (énergie)', 'energy-sensor', 'index', 'kilowatt-hour'],
    ],
  );
  assert.equal(gladys.fake.lastState(`${DEVICE_ID}:eaufroide`), 12.34);
  assert.equal(gladys.fake.lastState(`${DEVICE_ID}:cetc`), 89.01);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  // Next reading in 6 hours (the default), on the container's own timer.
  assert.deepEqual(timers.delays(), [6 * HOUR]);
});

test('heat cost allocators are a unitless counter, never energy', async (t) => {
  const { gladys } = await setup(t, {
    oceaOptions: { consos: { [DWELLING_ID]: fixture('consos-allocators.json') } },
    config: { language: 'en' },
  });
  await gladys.connect();
  const feature = gladys.fake.discoveredDevices[0].features.find((f) =>
    f.external_id.endsWith(':repartiteurfraischauffage'),
  );
  assert.equal(feature.name, 'Heating (allocator units)');
  assert.equal(feature.category, 'counter-sensor');
  assert.equal(feature.type, 'integer');
  assert.equal(feature.unit, null);
  assert.equal(gladys.fake.lastState(feature.external_id), 1234);
});

test('only changes are published, and everything again once the device is created', async (t) => {
  const { gladys, app, clock, timers } = await setup(t);
  await gladys.connect();
  const published = gladys.fake.states.length;
  assert.equal(published, 3);

  clock.now += 6 * HOUR;
  await timers.runAll();
  assert.equal(gladys.fake.states.length, published, 'nothing changed, nothing sent');

  await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
  assert.equal(gladys.fake.states.length, published + 3, 'all states sent again');
  assert.ok(gladys.fake.widgetRefreshes.includes('ocea_consumption'));
  assert.ok(app.state.dwellings[DWELLING_ID]);
});

test('a portal failure is retried in 30 minutes, not hammered', async (t) => {
  const { gladys, ocea, timers } = await setup(t);
  ocea.apiStatus = 503;
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /portail OCEA/);
  assert.deepEqual(timers.delays(), [RETRY_DELAY_MS]);

  ocea.apiStatus = 200;
  await timers.runAll();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.discoveredDevices.length, 1);
});

test('rejected credentials stop the readings until the configuration changes', async (t) => {
  const { gladys, ocea, timers } = await setup(t, { config: { password: 'wrong-password' } });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /rejected/);
  assert.deepEqual(timers.delays(), [], 'no retry with the same password');
  assert.equal(ocea.apiCalls().length, 0);

  await gladys.fake.configUpdated({ email: ocea.email, password: ocea.password });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(timers.delays(), [6 * HOUR]);
});

test('missing credentials are reported, nothing is read', async (t) => {
  const { gladys, ocea } = await setup(t, { config: { email: '', password: '' } });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.de, /Gib die E-Mail-Adresse/);
  assert.equal(ocea.calls.length, 0);
});

test('a restart republishes the saved reading and waits for the interval', async (t) => {
  const first = await setup(t);
  await first.gladys.connect();
  first.app.stop();

  const second = await setup(t, {
    dataDir: first.dataDir,
    ocea: first.ocea,
    now: first.clock.now + 2 * HOUR,
  });
  const apiCallsBefore = first.ocea.apiCalls().length;
  await second.gladys.connect();
  assert.equal(first.ocea.apiCalls().length, apiCallsBefore, 'OCEA not read again before 6 hours');
  assert.equal(second.gladys.fake.discoveredDevices.length, 1);
  assert.equal(second.gladys.fake.lastState(`${DEVICE_ID}:eaufroide`), 12.34);
  assert.deepEqual(second.timers.delays(), [4 * HOUR]);
});

test('a new reading interval reschedules the next reading', async (t) => {
  const { gladys, timers } = await setup(t);
  await gladys.connect();
  await gladys.fake.configUpdated({ ...gladys.config, refresh_hours: 24 });
  assert.deepEqual(timers.delays(), [24 * HOUR]);
  await gladys.fake.configUpdated({ ...gladys.config, refresh_hours: 99 });
  assert.deepEqual(timers.delays(), [24 * HOUR], 'clamped to 24 hours');
});

test('several dwellings get one device each, named after their address', async (t) => {
  const { gladys } = await setup(t, {
    oceaOptions: {
      resident: fixture('resident-two-dwellings.json'),
      consos: {
        [DWELLING_ID]: fixture('consos-water.json'),
        '00000000-0000-4000-8000-000000000002': fixture('consos-cetc.json'),
      },
    },
  });
  await gladys.connect();
  const devices = gladys.fake.discoveredDevices;
  assert.equal(devices.length, 2);
  assert.equal(new Set(devices.map((d) => d.external_id)).size, 2);
  assert.ok(devices.every((d) => d.name.startsWith('OCEA Smart Building – ')));
});

test('the test action reads now and says what it found', async (t) => {
  const { gladys } = await setup(t, { config: { email: '', password: '' } });
  await gladys.connect();
  let ack = await gladys.fake.action('test_connection');
  assert.equal(ack.success, true);
  assert.match(JSON.stringify(ack.data), /Saisissez/);

  await gladys.fake.configUpdated({
    email: 'resident@example.com',
    password: 'correct-horse-battery-staple',
  });
  ack = await gladys.fake.action('test_connection');
  assert.match(JSON.stringify(ack.data), /1 logement\(s\), 3 compteur\(s\)/);
});

test('the widget shows the month consumption per fluid, within the budget', async (t) => {
  const { gladys, ocea, clock, timers } = await setup(t);
  await gladys.connect();
  ocea.consos[DWELLING_ID] = [
    { fluide: 'EauFroide', valeur: '13,5', unite: 'm3' },
    { fluide: 'EauChaude', valeur: '5,67', unite: 'm3' },
    { fluide: 'CETC', valeur: '120', unite: 'kWh' },
  ];
  clock.now += 6 * HOUR;
  await timers.runAll();

  const ack = await gladys.fake.widgetGet('ocea_consumption', {
    settings: { dwelling: DEVICE_ID },
    language: 'fr',
  });
  assert.equal(ack.success, true);
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => [tile.label, tile.value, tile.unit]),
    [
      ['Eau froide', '1,16', 'm³'],
      ['Eau chaude', '0', 'm³'],
      ['Chauffage', '31', 'kWh'],
    ],
  );
  const texts = content.components.filter((c) => c.type === 'text');
  assert.deepEqual(
    texts.map((c) => c.text),
    ['Octobre 2026', 'Depuis le 13 oct. · relevé du 13 oct., 16:00'],
  );
});

test('the widget asks for a dwelling when none is set', async (t) => {
  const { gladys } = await setup(t);
  await gladys.connect();
  const ack = await gladys.fake.widgetGet('ocea_consumption', { settings: {}, language: 'es' });
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  assert.match(ack.data.content.components[0].text, /Elija una vivienda/);
});

test('onPoll republishes the cached reading without calling OCEA', async (t) => {
  const { gladys, ocea } = await setup(t);
  await gladys.connect();
  const calls = ocea.calls.length;
  const ack = await gladys.fake.poll(gladys.fake.discoveredDevices[0]);
  assert.equal(ack.success, true);
  assert.equal(ocea.calls.length, calls);
});

test('new credentials are checked at once, even when a reading is not due', async (t) => {
  const { gladys, ocea } = await setup(t);
  await gladys.connect();
  const signIns = ocea.signIns;
  ocea.password = 'new-password-5678';
  await gladys.fake.configUpdated({ ...gladys.config, password: 'wrong-again-0000' });
  assert.equal(
    gladys.fake.connectionStatus.connected,
    false,
    'a wrong password is never "connected"',
  );
  await gladys.fake.configUpdated({ ...gladys.config, password: 'new-password-5678' });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(ocea.signIns, signIns + 1);
});

test('rejected credentials are not retried on a Gladys reconnection', async (t) => {
  const { gladys, ocea } = await setup(t, { config: { password: 'wrong-password' } });
  await gladys.connect();
  const calls = ocea.calls.length;
  await gladys.disconnect();
  await gladys.connect();
  assert.equal(ocea.calls.length, calls, 'no new sign-in attempt');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  // The test action does retry: the user asked for it.
  await gladys.fake.action('test_connection');
  assert.ok(ocea.calls.length > calls);
});
