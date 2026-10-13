import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KINDS,
  classifyFluid,
  dwellingLabel,
  fluidKey,
  parseConsumptions,
  parseDwellingIds,
  parseNumber,
} from '../src/ocea/parse.js';
import { fixture } from './helpers/fake-ocea.js';

test('parseNumber reads the French decimal comma and thousands spaces', () => {
  assert.equal(parseNumber('12,34'), 12.34);
  assert.equal(parseNumber('1 234,5'), 1234.5);
  assert.equal(parseNumber('1 234'), 1234);
  assert.equal(parseNumber('12.5'), 12.5);
  assert.equal(parseNumber(7), 7);
  assert.ok(Number.isNaN(parseNumber('')));
  assert.ok(Number.isNaN(parseNumber('n/a')));
  assert.ok(Number.isNaN(parseNumber(null)));
});

test('fluid keys are stable whatever the spelling of the fluid', () => {
  assert.equal(fluidKey('EauFroide'), 'eaufroide');
  assert.equal(fluidKey('CETC'), fluidKey('Cetc'));
  assert.equal(fluidKey('Répartiteur'), 'repartiteur');
});

test('water is a volume, a heat meter an energy, allocator units are dimensionless', () => {
  assert.deepEqual(classifyFluid('EauFroide', 'm3'), { kind: KINDS.VOLUME, unit: 'cubicmeter' });
  assert.deepEqual(classifyFluid('EauChaude', 'm³'), { kind: KINDS.VOLUME, unit: 'cubicmeter' });
  assert.deepEqual(classifyFluid('EauChaude', ''), { kind: KINDS.VOLUME, unit: 'cubicmeter' });
  assert.deepEqual(classifyFluid('CETC', 'kWh'), { kind: KINDS.ENERGY, unit: 'kilowatt-hour' });
  assert.deepEqual(classifyFluid('Cetc', undefined), { kind: KINDS.ENERGY, unit: 'kilowatt-hour' });
  assert.deepEqual(classifyFluid('Chauffage', 'MWh'), {
    kind: KINDS.ENERGY,
    unit: 'megawatt-hour',
  });
  // Heat cost allocators: never kWh, whatever the name.
  assert.deepEqual(classifyFluid('RepartiteurFraisChauffage', 'unités'), {
    kind: KINDS.ALLOCATOR,
    unit: null,
  });
  assert.deepEqual(classifyFluid('Chauffage', 'U'), { kind: KINDS.ALLOCATOR, unit: null });
  assert.deepEqual(classifyFluid('Chauffage', ''), { kind: KINDS.ALLOCATOR, unit: null });
});

test('parseConsumptions reads the dashboard fixtures', () => {
  assert.deepEqual(parseConsumptions(fixture('consos-cetc.json')), [
    { key: 'eaufroide', fluide: 'EauFroide', kind: 'volume', unit: 'cubicmeter', value: 12.34 },
    { key: 'eauchaude', fluide: 'EauChaude', kind: 'volume', unit: 'cubicmeter', value: 5.67 },
    { key: 'cetc', fluide: 'CETC', kind: 'energy', unit: 'kilowatt-hour', value: 89.01 },
  ]);
  const allocators = parseConsumptions(fixture('consos-allocators.json'));
  assert.equal(allocators[1].kind, 'allocator');
  assert.equal(allocators[1].value, 1234);
});

test('parseConsumptions sums two meters of the same fluid and skips garbage', () => {
  const readings = parseConsumptions([
    { fluide: 'EauFroide', valeur: '10,1', unite: 'm3' },
    { fluide: 'EauFroide', valeur: '0,2', unite: 'm3' },
    { fluide: 'EauChaude', valeur: 'n/a', unite: 'm3' },
    { fluide: '', valeur: '3', unite: 'm3' },
    null,
  ]);
  assert.deepEqual(readings, [
    { key: 'eaufroide', fluide: 'EauFroide', kind: 'volume', unit: 'cubicmeter', value: 10.3 },
  ]);
  assert.deepEqual(parseConsumptions({ not: 'a list' }), []);
});

test('only the current occupations are read', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  assert.deepEqual(parseDwellingIds(fixture('resident.json'), now), [
    '00000000-0000-4000-8000-000000000001',
  ]);
  assert.deepEqual(parseDwellingIds(fixture('resident-two-dwellings.json'), now), [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  ]);
  // All over: the account still shows its last dwellings.
  assert.deepEqual(
    parseDwellingIds({ occupations: [{ logementId: 'a', dateFin: '2020-01-01' }] }, now),
    ['a'],
  );
  assert.deepEqual(parseDwellingIds({}, now), []);
});

test('dwellingLabel builds a short address', () => {
  assert.equal(dwellingLabel(fixture('local.json')), "1 rue de l'Exemple, Exempleville (21)");
  assert.equal(dwellingLabel({ local: { identificationLocal: 'LOT-9' } }), 'LOT-9');
  assert.equal(dwellingLabel(null), null);
});
