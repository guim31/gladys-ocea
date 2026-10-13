// -----------------------------------------------------------------------------
// Gladys devices: one device per dwelling, one feature per fluid.
//
//   water (m³)                   volume-sensor / decimal, cubicmeter
//   heat meter, CETC (kWh)       energy-sensor / index, kilowatt-hour
//   heat cost allocators (units) counter-sensor / integer, no unit
//
// The energy index is the one Gladys turns into consumption by itself: the
// core derives a 30-minute consumption feature and its cost from any
// `energy-sensor/index` (Gladys 5.1). Allocator units are NOT energy: they
// only say which share of the building's heating bill the dwelling pays, so
// they are a plain dimensionless counter, never kWh.
//
// External ids are forever: `ext:<selector>:dwelling:<logementId>` for the
// device, `<device>:<fluid key>` for the features (`eaufroide`, `eauchaude`,
// `cetc`...). The fluid key comes from the OCEA fluid name, never from a
// translated label.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import { KINDS, isHeatingFluid } from './ocea/parse.js';
import { t } from './i18n.js';

export const DEVICE_TYPE = 'dwelling';

// Display bounds (the core never enforces them on states): wide enough for
// any dwelling meter.
const FEATURE_SHAPES = {
  [KINDS.VOLUME]: { category: 'volume-sensor', type: 'decimal', min: 0, max: 1_000_000 },
  [KINDS.ENERGY]: { category: 'energy-sensor', type: 'index', min: 0, max: 100_000_000 },
  [KINDS.ALLOCATOR]: { category: 'counter-sensor', type: 'integer', min: 0, max: 100_000_000 },
};

export const dwellingIds = (gladys, dwellingId) => gladys.externalIds(DEVICE_TYPE, dwellingId);

/** The dwelling id of one of our device external ids, or null. */
export function dwellingIdOf(gladys, deviceExternalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (typeof deviceExternalId !== 'string' || !deviceExternalId.startsWith(prefix)) {
    return null;
  }
  const rest = deviceExternalId.slice(prefix.length);
  return rest && !rest.includes(':') ? rest : null;
}

/** Name of the feature of a reading, in the configured language. */
export function featureName(reading, language) {
  if (reading.key === 'eaufroide') {
    return t('feature_cold_water', language);
  }
  if (reading.key === 'eauchaude') {
    return t('feature_hot_water', language);
  }
  if (reading.kind === KINDS.ENERGY && isHeatingFluid(reading.fluide)) {
    return t('feature_heating_energy', language);
  }
  if (reading.kind === KINDS.ALLOCATOR && isHeatingFluid(reading.fluide)) {
    return t('feature_heating_allocator', language);
  }
  // A fluid nobody has reported yet: its OCEA name is the best label.
  return reading.fluide.slice(0, 60);
}

/**
 * Discovery payload of one dwelling.
 * @param {object} dwelling { id, label, readings }
 * @param {object} options { language, multiple } — `multiple` adds the
 *   address to the name when the account holds several dwellings.
 */
export function buildDevice(gladys, dwelling, { language, multiple = false }) {
  const ids = dwellingIds(gladys, dwelling.id);
  const base = t('device_name', language);
  const name = multiple && dwelling.label ? `${base} – ${dwelling.label}` : base;
  return {
    name,
    external_id: ids.device,
    // Readings change a few times a day: the container reads OCEA on its own
    // timer (hours), Gladys must not poll.
    should_poll: false,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: dwelling.readings.map((reading) => {
      const shape = FEATURE_SHAPES[reading.kind];
      return {
        name: featureName(reading, language),
        external_id: ids.feature(reading.key),
        category: shape.category,
        type: shape.type,
        unit: reading.unit,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: shape.min,
        max: shape.max,
      };
    }),
  };
}

/** The states of one dwelling, in the `publishStates` format. */
export function buildStates(gladys, dwelling) {
  const ids = dwellingIds(gladys, dwelling.id);
  return dwelling.readings.map((reading) => ({
    device_feature_external_id: ids.feature(reading.key),
    state: reading.value,
  }));
}
