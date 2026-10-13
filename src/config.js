// -----------------------------------------------------------------------------
// Integration configuration, filled in by the user from the `config_schema`
// of `gladys-assistant-integration.json`.
//
// This module provides the defaults and normalizes the received object, so
// the rest of the code never deals with `undefined` or with strings sent by
// a form.
// -----------------------------------------------------------------------------

import { DEFAULT_LANGUAGE, LANGUAGES } from './i18n.js';

export const MIN_REFRESH_HOURS = 1;
export const MAX_REFRESH_HOURS = 24;

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULT_CONFIG = {
  email: '',
  // A `secret` field has no default in the manifest.
  password: '',
  // OCEA meters report once or a few times a day: every 6 hours is plenty.
  refresh_hours: 6,
  // Language of the device and feature names (Gladys does not tell a device
  // integration the user's language).
  language: DEFAULT_LANGUAGE,
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const hours = Math.round(Number(raw.refresh_hours ?? DEFAULT_CONFIG.refresh_hours));
  return {
    email: typeof raw.email === 'string' ? raw.email.trim() : DEFAULT_CONFIG.email,
    password: typeof raw.password === 'string' ? raw.password : DEFAULT_CONFIG.password,
    refresh_hours: Number.isFinite(hours)
      ? Math.min(MAX_REFRESH_HOURS, Math.max(MIN_REFRESH_HOURS, hours))
      : DEFAULT_CONFIG.refresh_hours,
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language,
  };
}

export const hasCredentials = (config) => config.email !== '' && config.password !== '';
