// -----------------------------------------------------------------------------
// Small JSON files under /data, the only writable volume of the container.
//
//   session.json  the OCEA refresh token (and a hash of its account's e-mail)
//   state.json    the last readings and the start-of-month indexes
//
// Both are written atomically (temporary file + rename) with mode 0600: the
// session is a credential.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULT_DATA_DIR = process.env.OCEA_DATA_DIR || '/data';

export function createJsonFile(dataDir, name) {
  const path = join(dataDir, name);
  return {
    path,
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch {
        return null;
      }
    },
    async save(value) {
      await mkdir(dataDir, { recursive: true });
      const temporary = `${path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
      await rename(temporary, path);
    },
  };
}
