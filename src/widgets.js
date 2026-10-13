// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): the consumption of the
// current month, one tile per fluid, for the dwelling picked in the widget
// settings (`source: "devices"`).
//
// Budget of the core: 8 components, 2 texts at most. This widget sends one
// heading (the month), up to 6 tiles and one caption (since when, last
// reading): 8 at most.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { consumptionOf } from './history.js';
import { KINDS } from './ocea/parse.js';
import { dwellingIdOf } from './devices.js';
import { normalizeLanguage, t } from './i18n.js';

export const WIDGET_KEY = 'ocea_consumption';
const MAX_TILES = 6;

const UNIT_LABELS = {
  cubicmeter: 'm³',
  liter: 'L',
  'watt-hour': 'Wh',
  'kilowatt-hour': 'kWh',
  'megawatt-hour': 'MWh',
};

function tileStyle(reading) {
  if (reading.key === 'eaufroide') {
    return { icon: 'droplet', color: WIDGET_COLORS.INFO, label: 'feature_cold_water' };
  }
  if (reading.key === 'eauchaude') {
    return { icon: 'droplet', color: WIDGET_COLORS.DANGER, label: 'feature_hot_water' };
  }
  if (reading.kind === KINDS.VOLUME) {
    return { icon: 'droplet', color: WIDGET_COLORS.NEUTRAL, label: null };
  }
  return { icon: 'thermometer', color: WIDGET_COLORS.WARNING, label: 'widget_heating' };
}

function formatValue(value, reading, language) {
  // m³ by the litre, kWh and allocator units whole beyond 100.
  const digits = reading.kind === KINDS.VOLUME ? 3 : value >= 100 ? 0 : 1;
  return new Intl.NumberFormat(language, { maximumFractionDigits: digits })
    .format(value)
    .slice(0, 12);
}

function formatDate(iso, language, timeZone, withTime) {
  return new Intl.DateTimeFormat(language, {
    timeZone,
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso));
}

const textComponent = (text, variant) => ({ type: 'text', variant, text });

/**
 * Content of the widget.
 * @param {object} gladys the SDK client (to read the external ids)
 * @param {object} state the app state: { dwellings: { [id]: { readings, history } } }
 * @param {object} request { settings, language }
 */
export function buildWidgetContent(gladys, state, { settings = {}, language }, options = {}) {
  const lang = normalizeLanguage(language);
  const timeZone = options.timeZone ?? (process.env.TZ || undefined);
  const now = options.now ?? new Date();
  const dwellingId = dwellingIdOf(gladys, settings.dwelling);
  if (!dwellingId) {
    return {
      ttl_seconds: 3600,
      components: [textComponent(t('widget_pick_dwelling', lang), 'body')],
    };
  }
  const dwelling = state.dwellings?.[dwellingId];
  const readings = (dwelling?.readings ?? []).filter(
    (reading) => consumptionOf(dwelling.history?.[reading.key]) !== null,
  );
  if (readings.length === 0) {
    return { ttl_seconds: 3600, components: [textComponent(t('widget_no_reading', lang), 'body')] };
  }

  const month = new Intl.DateTimeFormat(lang, { timeZone, month: 'long', year: 'numeric' }).format(
    now,
  );
  const tiles = readings.slice(0, MAX_TILES).map((reading) => {
    const style = tileStyle(reading);
    const value = consumptionOf(dwelling.history[reading.key]);
    return {
      type: 'value',
      value: formatValue(value, reading, lang),
      unit: reading.unit ? UNIT_LABELS[reading.unit] : t('unit_allocator', lang),
      label: (style.label ? t(style.label, lang) : reading.fluide).slice(0, 24),
      icon: style.icon,
      color: style.color,
    };
  });
  const entries = readings.map((reading) => dwelling.history[reading.key]);
  const since = entries.map((entry) => entry.baselineAt).sort()[0];
  const last = entries
    .map((entry) => entry.lastAt)
    .sort()
    .at(-1);
  const caption = t('widget_since', lang, {
    since: formatDate(since, lang, timeZone, false),
    last: formatDate(last, lang, timeZone, true),
  });
  return {
    ttl_seconds: 3600,
    components: [
      textComponent(month.charAt(0).toUpperCase() + month.slice(1), 'heading'),
      ...tiles,
      textComponent(caption.slice(0, 80), 'caption'),
    ],
  };
}

/** Widget handlers, keyed like the manifest `widgets` (see app.js). */
export function createWidgets(getContext) {
  return {
    [WIDGET_KEY]: {
      get: async (request) => {
        const { gladys, state, timeZone, now } = getContext();
        return buildWidgetContent(gladys, state, request, { timeZone, now });
      },
    },
  };
}

export const WIDGET_KEYS = [WIDGET_KEY];
