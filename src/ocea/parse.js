// -----------------------------------------------------------------------------
// Turn the OCEA answers into plain readings.
//
// `dashboard/consos` answers one entry per fluid:
//   [{ "fluide": "EauFroide", "valeur": "12,34", "unite": "m3" }, ...]
// with a French decimal comma. The fluid names seen so far are `EauFroide`,
// `EauChaude` and `CETC` (also spelled `Cetc` by another endpoint); other
// names are kept, and classified by their unit.
// -----------------------------------------------------------------------------

/** Kinds of readings, each one published with its own Gladys feature type. */
export const KINDS = {
  // A volume index, in m³.
  VOLUME: 'volume',
  // A thermal energy index, in kWh (CETC: compteur d'énergie thermique).
  ENERGY: 'energy',
  // A heat cost allocator index: dimensionless units, a share of the
  // building's heating bill, never an energy.
  ALLOCATOR: 'allocator',
};

/** Parse "12,34", "1 234,5", "12.34" or a number. Returns NaN when unparsable. */
export function parseNumber(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : NaN;
  }
  if (typeof raw !== 'string') {
    return NaN;
  }
  // \s also matches the no-break spaces of French number formatting.
  const compact = raw.replace(/\s/g, '');
  if (!/^-?\d+([.,]\d+)?$/.test(compact)) {
    return NaN;
  }
  return Number(compact.replace(',', '.'));
}

/** Stable feature key of a fluid: `EauFroide` -> `eaufroide`, `Cetc` -> `cetc`. */
export function fluidKey(fluide) {
  return String(fluide ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Normalize a unit label: `m³`, `M3`, ` kWh ` -> `m3`, `m3`, `kwh`. */
function normalizeUnit(unite) {
  return String(unite ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/³/g, '3')
    .replace(/\s/g, '')
    .toLowerCase();
}

// Energy units of a heat meter, mapped to the Gladys units.
const ENERGY_UNITS = { wh: 'watt-hour', kwh: 'kilowatt-hour', mwh: 'megawatt-hour' };
const VOLUME_UNITS = { m3: 'cubicmeter', l: 'liter', litre: 'liter', litres: 'liter' };

const HEATING_NAME = /chauf|cetc|calor|repart|rfc|therm|heat/;

/**
 * Classify one fluid. The unit decides first, the name only fills the gaps:
 * a heating fluid reported without an energy or volume unit is a heat cost
 * allocator (units), whatever OCEA calls it.
 * @returns {{ kind: string, unit: string|null }}
 */
export function classifyFluid(fluide, unite) {
  const key = fluidKey(fluide);
  const unit = normalizeUnit(unite);
  if (ENERGY_UNITS[unit]) {
    return { kind: KINDS.ENERGY, unit: ENERGY_UNITS[unit] };
  }
  if (VOLUME_UNITS[unit]) {
    return { kind: KINDS.VOLUME, unit: VOLUME_UNITS[unit] };
  }
  if (key === 'eaufroide' || key === 'eauchaude') {
    // Water without a readable unit: OCEA water meters count in m³.
    return { kind: KINDS.VOLUME, unit: 'cubicmeter' };
  }
  if (key === 'cetc' && unit === '') {
    // CETC is an energy meter: kWh is the unit OCEA reports for it.
    return { kind: KINDS.ENERGY, unit: 'kilowatt-hour' };
  }
  // Heat cost allocators ("unités", "U", no unit...) and anything else
  // without a physical unit: a dimensionless index.
  return { kind: KINDS.ALLOCATOR, unit: null };
}

export function isHeatingFluid(fluide) {
  return HEATING_NAME.test(fluidKey(fluide));
}

/**
 * Readings of one dwelling, one per fluid.
 * Two entries of the same fluid (two meters on separate risers) are summed:
 * the dashboard value of a fluid is the dwelling's total.
 * @returns {Array<{ key: string, fluide: string, kind: string, unit: string|null, value: number }>}
 */
export function parseConsumptions(payload) {
  const list = Array.isArray(payload) ? payload : [];
  const byKey = new Map();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const key = fluidKey(entry.fluide);
    const value = parseNumber(entry.valeur);
    if (!key || !Number.isFinite(value)) {
      continue;
    }
    const { kind, unit } = classifyFluid(entry.fluide, entry.unite);
    const existing = byKey.get(key);
    if (existing && existing.kind === kind && existing.unit === unit) {
      existing.value += value;
      continue;
    }
    if (existing) {
      // Same fluid in another unit: keep the first one, the feature is typed.
      continue;
    }
    byKey.set(key, { key, fluide: String(entry.fluide), kind, unit, value });
  }
  for (const reading of byKey.values()) {
    // Summing decimals: keep the meter's precision (OCEA gives at most 3).
    reading.value = Math.round(reading.value * 1000) / 1000;
  }
  return [...byKey.values()];
}

const isPast = (date, now) => {
  const time = Date.parse(date);
  return Number.isFinite(time) && time < now;
};

/**
 * Dwellings of the account, from `/api/v1/resident`. An account keeps the
 * occupations it ended (a move): only the current ones are read, unless all
 * of them are over.
 * @returns {string[]} the dwelling ids (`logementId`)
 */
export function parseDwellingIds(resident, now = Date.now()) {
  const occupations = Array.isArray(resident?.occupations) ? resident.occupations : [];
  const valid = occupations.filter((o) => o && o.logementId !== undefined && o.logementId !== '');
  const current = valid.filter((o) => !o.dateFin || !isPast(o.dateFin, now));
  const chosen = current.length > 0 ? current : valid;
  return [...new Set(chosen.map((o) => String(o.logementId)))];
}

/**
 * A short label of a dwelling, from `/api/v1/local/{id}`: "12 rue X, Ville"
 * or its OCEA reference. Null when the answer holds neither.
 */
export function dwellingLabel(local) {
  const info = local?.local;
  if (!info || typeof info !== 'object') {
    return null;
  }
  const address = info.adresse ?? {};
  const street = typeof address.numeroRue === 'string' ? address.numeroRue.trim() : '';
  const city = typeof address.ville === 'string' ? address.ville.trim() : '';
  const door = typeof info.numeroPorte === 'string' ? info.numeroPorte.trim() : '';
  const parts = [street, city].filter(Boolean);
  if (parts.length > 0) {
    return (door ? `${parts.join(', ')} (${door})` : parts.join(', ')).slice(0, 80);
  }
  const reference =
    typeof info.identificationLocal === 'string' ? info.identificationLocal.trim() : '';
  return reference ? reference.slice(0, 80) : null;
}
