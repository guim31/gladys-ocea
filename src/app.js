// -----------------------------------------------------------------------------
// The integration: reads OCEA on a timer and publishes one device per
// dwelling. Every SDK handler is registered here; index.js only builds the
// SDK client and connects.
//
// Pace: OCEA meters report once or a few times a day, so the container reads
// the portal every `refresh_hours` (6 by default, 1 to 24) on its own timer —
// Gladys polls at most once a minute, far too often for a cloud portal. The
// last reading is kept under /data: a restart republishes it at once, and
// only reads OCEA again when the interval has elapsed.
//
// An unchanged index is still sent to Gladys at least every 12 hours: past
// 48 hours without a state, the front shows "no recent value". The timer
// never sleeps longer than that, and wakes up only to republish when no
// reading is due.
//
// Quiet logs: a normal reading writes at debug level only. Info keeps the
// lifecycle (first reading, recovery) and the user's actions; a failure that
// repeats is logged once, then once again when it recovers.
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { hasCredentials, normalizeConfig } from './config.js';
import { buildDevice, buildStates, dwellingIdOf } from './devices.js';
import { recordReading } from './history.js';
import { tAll } from './i18n.js';
import { OceaClient, accountKey } from './ocea/client.js';
import { OceaAuthError } from './ocea/errors.js';
import { dwellingLabel, parseConsumptions, parseDwellingIds } from './ocea/parse.js';
import { redactingLogger } from './redact.js';
import { DEFAULT_DATA_DIR, createJsonFile } from './store.js';
import { WIDGET_KEY, createWidgets } from './widgets.js';

const HOUR_MS = 3600 * 1000;
// After a failure (portal down, sign-in flow hiccup): try again sooner than
// the normal interval, but never hammer the portal.
export const RETRY_DELAY_MS = 30 * 60 * 1000;
// The longest sleep of the timer, and so the longest gap between two
// publications of an unchanged state.
export const REPUBLISH_MS = 12 * HOUR_MS;
// A state older than this is sent again with the next publication, so that
// the reading or wake-up REPUBLISH_MS later always carries it.
const STALE_MS = REPUBLISH_MS - HOUR_MS;

const emptyState = () => ({ version: 1, account: null, lastRunAt: null, dwellings: {} });

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [deps] injected in the tests
 */
export function createApp(gladys, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const timers = deps.timers ?? { setTimeout, clearTimeout };
  const dataDir = deps.dataDir ?? DEFAULT_DATA_DIR;
  const sessionFile = createJsonFile(dataDir, 'session.json');
  const stateFile = createJsonFile(dataDir, 'state.json');

  let config = normalizeConfig();
  let client = null;
  let state = emptyState();
  let stateLoaded = false;
  let timer = null;
  // Last full publication of the states, on the injected clock.
  let lastFullPublishAt = null;
  // Logged once per streak, see logFailure.
  let oceaFailure = null;
  let gladysFailure = null;
  let oceaReadOnce = false;
  let running = null;
  let stopped = false;
  // Credentials OCEA explicitly rejected: never retried on their own (a
  // reconnection to Gladys, the timer), only by the user (new values or the
  // test action), so the account is never locked.
  let rejected = null;

  const log = redactingLogger(deps.logger ?? sdkLogger, () =>
    client ? client.secrets() : [config.email, config.password],
  );

  // --- Helpers ---------------------------------------------------------------

  async function loadState() {
    if (stateLoaded) {
      return;
    }
    stateLoaded = true;
    const stored = await stateFile.load();
    if (
      stored &&
      stored.version === 1 &&
      stored.dwellings &&
      typeof stored.dwellings === 'object'
    ) {
      state = { ...emptyState(), ...stored };
    }
  }

  function getClient() {
    if (!client || client.email !== config.email || client.password !== config.password) {
      client = new OceaClient({
        email: config.email,
        password: config.password,
        fetch: fetchImpl,
        sessionStore: sessionFile,
        now,
        // Credentials changed while running: sign in with them for real.
        freshSession: client !== null,
      });
    }
    return client;
  }

  const dwellingList = () => Object.values(state.dwellings);

  function buildDevices() {
    const list = dwellingList();
    return list.map((dwelling) =>
      buildDevice(gladys, dwelling, { language: config.language, multiple: list.length > 1 }),
    );
  }

  // Only the changed states, except every STALE_MS: then all of them, so an
  // index that does not move still has a recent value in Gladys.
  async function publishAll() {
    if (dwellingList().length === 0) {
      return;
    }
    const devices = buildDevices();
    await gladys.publishDiscoveredDevices(devices);
    const full = lastFullPublishAt === null || now() - lastFullPublishAt >= STALE_MS;
    if (full) {
      for (const device of devices) {
        gladys.forgetPublishedStates(device.external_id);
      }
    }
    await gladys.publishChangedStates(
      dwellingList().flatMap((dwelling) => buildStates(gladys, dwelling)),
    );
    if (full) {
      lastFullPublishAt = now();
    }
    gladysRecovered();
  }

  // A failure is logged when it starts (or changes), then only at debug
  // level until it recovers: a portal down for a day writes two lines, not
  // one per attempt.
  function logFailure(previous, kind, message, err) {
    if (previous === kind) {
      log.debug(message, err);
    } else {
      log.error(message, err);
    }
    return kind;
  }

  function gladysFailed(message, err) {
    gladysFailure = logFailure(gladysFailure, 'gladys', message, err);
  }

  function gladysRecovered() {
    if (gladysFailure) {
      log.info('Publishing to Gladys works again');
      gladysFailure = null;
    }
  }

  // Next OCEA reading in delayMs. A longer delay than REPUBLISH_MS is cut
  // into wake-ups that only republish the last reading.
  function schedule(delayMs) {
    if (timer) {
      timers.clearTimeout(timer);
      timer = null;
    }
    if (stopped || delayMs === null) {
      return;
    }
    const delay = Math.max(0, delayMs);
    if (delay <= REPUBLISH_MS) {
      timer = timers.setTimeout(() => {
        timer = null;
        return refresh().catch((err) => log.error('Scheduled OCEA reading failed', err));
      }, delay);
      return;
    }
    timer = timers.setTimeout(async () => {
      timer = null;
      log.debug('Republishing the last reading');
      try {
        await publishAll();
      } catch (err) {
        gladysFailed('Publishing to Gladys failed', err);
      }
      schedule(delay - REPUBLISH_MS);
    }, REPUBLISH_MS);
  }

  const intervalMs = () => config.refresh_hours * HOUR_MS;

  async function setStatus(connected, key) {
    await gladys.setConnectionStatus(connected, key ? tAll(key) : undefined).catch((err) => {
      gladysFailed('Could not report the connection status', err);
    });
  }

  // --- One OCEA reading ------------------------------------------------------

  async function readOcea() {
    const ocea = getClient();
    const dwellingIds = parseDwellingIds(await ocea.getResident(), now());
    if (dwellingIds.length === 0) {
      return { ok: false, status: 'status_no_dwelling' };
    }
    const at = new Date(now());
    const dwellings = {};
    for (const id of dwellingIds) {
      const previous = state.dwellings[id];
      const readings = parseConsumptions(await ocea.getConsumptions(id));
      let label = previous?.label ?? null;
      if (label === null && dwellingIds.length > 1) {
        // Only needed to tell several dwellings apart; a failure is harmless.
        label = await ocea
          .getDwelling(id)
          .then(dwellingLabel)
          .catch(() => null);
      }
      const history = { ...(previous?.history ?? {}) };
      for (const reading of readings) {
        history[reading.key] = recordReading(
          history[reading.key],
          reading.value,
          at,
          deps.timeZone,
        );
      }
      dwellings[id] = { id, label, readings, history };
    }
    state = { ...state, account: accountKey(config.email), lastRunAt: at.toISOString(), dwellings };
    await stateFile.save(state);
    return {
      ok: true,
      dwellings: dwellingIds.length,
      meters: Object.values(dwellings).reduce((sum, d) => sum + d.readings.length, 0),
    };
  }

  /**
   * Read OCEA now, publish, and schedule the next reading.
   * Resolves { ok, status?, dwellings?, meters? }; never rejects on an OCEA
   * failure (it is reported in the connection status).
   */
  function refresh({ force = false } = {}) {
    if (!running) {
      running = runRefresh(force).finally(() => {
        running = null;
      });
    }
    return running;
  }

  async function runRefresh(force) {
    await loadState();
    if (!hasCredentials(config)) {
      schedule(null);
      await setStatus(false, 'status_missing_credentials');
      return { ok: false, status: 'status_missing_credentials' };
    }
    const isRejected = rejected?.email === config.email && rejected?.password === config.password;
    if (isRejected && !force) {
      schedule(null);
      await setStatus(false, 'status_invalid_credentials');
      return { ok: false, status: 'status_invalid_credentials' };
    }
    rejected = null;
    let result;
    try {
      result = await readOcea();
    } catch (err) {
      const kind =
        err instanceof OceaAuthError
          ? err.invalidCredentials
            ? 'status_invalid_credentials'
            : 'status_auth_failed'
          : 'status_api_failed';
      oceaFailure = logFailure(oceaFailure, kind, 'OCEA reading failed', err);
      if (err instanceof OceaAuthError && err.invalidCredentials) {
        // Retrying the same password would only lock the account: wait for
        // the user to fix the configuration.
        rejected = { email: config.email, password: config.password };
        schedule(null);
        await setStatus(false, 'status_invalid_credentials');
        return { ok: false, status: 'status_invalid_credentials' };
      }
      const status = err instanceof OceaAuthError ? 'status_auth_failed' : 'status_api_failed';
      schedule(RETRY_DELAY_MS);
      await setStatus(false, status);
      return { ok: false, status };
    }
    if (!result.ok) {
      schedule(intervalMs());
      await setStatus(false, result.status);
      return result;
    }
    const summary = `${result.dwellings} dwelling(s), ${result.meters} meter(s)`;
    if (oceaFailure) {
      log.info(`OCEA reachable again: ${summary}`);
    } else if (!oceaReadOnce) {
      log.info(`Connected to OCEA: ${summary}`);
    } else {
      log.debug(`OCEA read: ${summary}`);
    }
    oceaFailure = null;
    oceaReadOnce = true;
    schedule(intervalMs());
    try {
      await publishAll();
    } catch (err) {
      // Gladys unreachable: the readings are saved, they go out on reconnection.
      gladysFailed('Publishing to Gladys failed', err);
    }
    await setStatus(true);
    gladys.requestWidgetRefresh(WIDGET_KEY);
    return result;
  }

  // Start (or restart) the cycle: republish what is known, read OCEA when due
  // (or right away: new credentials must be checked at once).
  async function start({ readNow = false } = {}) {
    await loadState();
    if (state.account && state.account !== accountKey(config.email)) {
      // Another account: its readings and history are not this one's.
      state = emptyState();
    }
    try {
      await publishAll();
    } catch (err) {
      gladysFailed('Publishing to Gladys failed', err);
    }
    if (!hasCredentials(config)) {
      return refresh();
    }
    const last = Date.parse(state.lastRunAt ?? '');
    const due = Number.isFinite(last) ? last + intervalMs() - now() : 0;
    if (readNow || due <= 0 || dwellingList().length === 0) {
      return refresh();
    }
    schedule(due);
    await setStatus(true);
    return { ok: true, scheduled: due };
  }

  // --- SDK handlers ----------------------------------------------------------

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await start();
    } catch (err) {
      log.error('Post-connection initialization failed', err);
    }
  });

  gladys.onConfigUpdated(async (newConfig) => {
    const previous = config;
    config = normalizeConfig(newConfig);
    const credentialsChanged =
      previous.email !== config.email || previous.password !== config.password;
    log.info(`Configuration saved${credentialsChanged ? ', new credentials' : ''}`);
    if (credentialsChanged) {
      await start({ readNow: true });
      return;
    }
    if (previous.language !== config.language) {
      // New names only apply to devices not created yet (Gladys freezes them).
      await publishAll();
    }
    if (previous.refresh_hours !== config.refresh_hours && hasCredentials(config)) {
      const last = Date.parse(state.lastRunAt ?? '');
      schedule(Number.isFinite(last) ? last + intervalMs() - now() : 0);
    }
  });

  gladys.onScanRequest(async () => {
    log.info('Scan requested');
    await loadState();
    if (dwellingList().length === 0) {
      await refresh();
      return;
    }
    await publishAll();
  });

  // A state published before the feature exists is dropped by Gladys: send
  // them all again once the user adds the device.
  gladys.onDeviceCreated(async (device) => {
    const dwelling = state.dwellings[dwellingIdOf(gladys, device.external_id)];
    if (!dwelling) {
      return;
    }
    log.info('Device added in Gladys: its states are sent again');
    gladys.forgetPublishedStates(device.external_id);
    await gladys.publishChangedStates(buildStates(gladys, dwelling));
    gladys.requestWidgetRefresh(WIDGET_KEY);
  });

  // Fallback only: the devices are published with should_poll: false. Never
  // calls OCEA, it republishes the last reading.
  gladys.onPoll(async (device) => {
    const dwelling = state.dwellings[dwellingIdOf(gladys, device.external_id)];
    if (dwelling) {
      await gladys.publishChangedStates(buildStates(gladys, dwelling));
    }
  });

  gladys.onAction('test_connection', async () => {
    // A deliberate tap: tries again even credentials OCEA rejected before.
    log.info('Test action: reading OCEA now');
    const result = await refresh({ force: true });
    if (result.ok) {
      return tAll('action_ok', { dwellings: result.dwellings, meters: result.meters });
    }
    return tAll(result.status);
  });

  const widgets = createWidgets(() => ({
    gladys,
    state,
    timeZone: deps.timeZone,
    now: new Date(now()),
  }));
  for (const [key, widget] of Object.entries(widgets)) {
    gladys.onWidgetGet(key, (request) => widget.get(request));
  }

  return {
    refresh,
    stop() {
      stopped = true;
      schedule(null);
    },
    get state() {
      return state;
    },
    get config() {
      return config;
    },
    widgets,
  };
}
