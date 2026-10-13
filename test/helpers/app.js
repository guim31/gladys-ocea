// Build the integration against the SDK's fake Gladys and a fake OCEA.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { TEST_EMAIL, TEST_PASSWORD, createFakeOcea, createManualTimers } from './fake-ocea.js';

export const DWELLING_ID = '00000000-0000-4000-8000-000000000001';
export const DEVICE_ID = `ext:test-integration:dwelling:${DWELLING_ID}`;

export function captureLogger() {
  const lines = [];
  const record =
    (level) =>
    (...args) =>
      lines.push(`[${level}] ${args.map(String).join(' ')}`);
  return {
    lines,
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
}

export async function setup(t, options = {}) {
  const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), 'gladys-ocea-app-')));
  if (!options.dataDir) {
    t.after(() => rm(dataDir, { recursive: true, force: true }));
  }
  const ocea = options.ocea ?? createFakeOcea(options.oceaOptions);
  const timers = createManualTimers();
  const logger = captureLogger();
  const clock = { now: options.now ?? Date.parse('2026-10-13T08:00:00Z') };
  const gladys = createFakeGladys({
    config: { email: TEST_EMAIL, password: TEST_PASSWORD, ...(options.config ?? {}) },
    devices: options.devices ?? [],
  });
  const app = createApp(gladys, {
    // Late-bound, so a test can swap the fake's fetch.
    fetch: (...args) => ocea.fetch(...args),
    dataDir,
    timers,
    logger,
    now: () => clock.now,
    timeZone: 'Europe/Paris',
  });
  t.after(() => app.stop());
  return { gladys, app, ocea, timers, logger, clock, dataDir };
}
