// -----------------------------------------------------------------------------
// Every text the container sends to Gladys, in the four languages of the
// integration. German uses "du", Spanish "usted" (maintainer's decision).
// `{name}` placeholders are filled by `t()`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const DEFAULT_LANGUAGE = 'fr';

export const TEXTS = {
  // Device and feature names (frozen by Gladys when the device is created).
  device_name: {
    en: 'OCEA Smart Building',
    fr: 'OCEA Smart Building',
    de: 'OCEA Smart Building',
    es: 'OCEA Smart Building',
  },
  feature_cold_water: {
    en: 'Cold water',
    fr: 'Eau froide',
    de: 'Kaltwasser',
    es: 'Agua fría',
  },
  feature_hot_water: {
    en: 'Hot water',
    fr: 'Eau chaude',
    de: 'Warmwasser',
    es: 'Agua caliente',
  },
  feature_heating_energy: {
    en: 'Heating (energy)',
    fr: 'Chauffage (énergie)',
    de: 'Heizung (Energie)',
    es: 'Calefacción (energía)',
  },
  feature_heating_allocator: {
    en: 'Heating (allocator units)',
    fr: 'Chauffage (unités de répartiteur)',
    de: 'Heizung (Verteilereinheiten)',
    es: 'Calefacción (unidades de repartidor)',
  },

  // Connection status shown in the Configuration screen.
  status_missing_credentials: {
    en: 'Enter the e-mail and the password of your OCEA resident portal.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre espace résident OCEA.',
    de: 'Gib die E-Mail-Adresse und das Passwort deines OCEA-Bewohnerportals ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su espacio de residente OCEA.',
  },
  status_invalid_credentials: {
    en: 'OCEA rejected the e-mail or the password: check them in the configuration.',
    fr: 'OCEA a refusé l’e-mail ou le mot de passe : vérifiez-les dans la configuration.',
    de: 'OCEA hat die E-Mail-Adresse oder das Passwort abgelehnt: prüfe sie in der Konfiguration.',
    es: 'OCEA ha rechazado el correo electrónico o la contraseña: compruébelos en la configuración.',
  },
  status_auth_failed: {
    en: 'Sign-in to OCEA failed, new attempt in 30 minutes. See the integration logs.',
    fr: 'La connexion à OCEA a échoué, nouvel essai dans 30 minutes. Voir les logs de l’intégration.',
    de: 'Die Anmeldung bei OCEA ist fehlgeschlagen, neuer Versuch in 30 Minuten. Sieh in die Logs der Integration.',
    es: 'El inicio de sesión en OCEA ha fallado, nuevo intento en 30 minutos. Consulte los registros de la integración.',
  },
  status_api_failed: {
    en: 'The OCEA portal did not answer, new attempt in 30 minutes.',
    fr: 'Le portail OCEA n’a pas répondu, nouvel essai dans 30 minutes.',
    de: 'Das OCEA-Portal hat nicht geantwortet, neuer Versuch in 30 Minuten.',
    es: 'El portal de OCEA no ha respondido, nuevo intento en 30 minutos.',
  },
  status_no_dwelling: {
    en: 'No dwelling found on this OCEA account.',
    fr: 'Aucun logement trouvé sur ce compte OCEA.',
    de: 'Auf diesem OCEA-Konto wurde keine Wohnung gefunden.',
    es: 'No se ha encontrado ninguna vivienda en esta cuenta de OCEA.',
  },

  // Result of the "Test the connection" action.
  action_ok: {
    en: 'Connected to OCEA: {dwellings} dwelling(s), {meters} meter(s) read.',
    fr: 'Connecté à OCEA : {dwellings} logement(s), {meters} compteur(s) relevé(s).',
    de: 'Mit OCEA verbunden: {dwellings} Wohnung(en), {meters} Zähler ausgelesen.',
    es: 'Conectado a OCEA: {dwellings} vivienda(s), {meters} contador(es) leído(s).',
  },

  // Dashboard widget.
  widget_since: {
    en: 'Since {since} · reading of {last}',
    fr: 'Depuis le {since} · relevé du {last}',
    de: 'Seit {since} · Ablesung vom {last}',
    es: 'Desde el {since} · lectura del {last}',
  },
  widget_no_reading: {
    en: 'No reading yet: it comes with the next OCEA reading.',
    fr: 'Pas encore de relevé : il arrivera avec le prochain relevé OCEA.',
    de: 'Noch keine Ablesung: die erste kommt mit der nächsten OCEA-Ablesung.',
    es: 'Todavía no hay lectura: llegará con la próxima lectura de OCEA.',
  },
  widget_pick_dwelling: {
    en: 'Choose a dwelling in the settings of this widget.',
    fr: 'Choisissez un logement dans les réglages de ce widget.',
    de: 'Wähle eine Wohnung in den Einstellungen dieses Widgets.',
    es: 'Elija una vivienda en los ajustes de este widget.',
  },
  widget_heating: {
    en: 'Heating',
    fr: 'Chauffage',
    de: 'Heizung',
    es: 'Calefacción',
  },
  unit_allocator: {
    en: 'units',
    fr: 'unités',
    de: 'Einh.',
    es: 'unid.',
  },
};

export function normalizeLanguage(language) {
  const short = String(language ?? '')
    .slice(0, 2)
    .toLowerCase();
  return LANGUAGES.includes(short) ? short : 'en';
}

/** One text in one language, placeholders filled. */
export function t(key, language, vars = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    throw new Error(`Unknown text "${key}"`);
  }
  const text = entry[normalizeLanguage(language)] ?? entry.en;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/** A text in every language, for the multi-language messages of Gladys. */
export function tAll(key, vars = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, t(key, language, vars)]));
}
