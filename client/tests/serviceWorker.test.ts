import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { devWorkerSource, productionWorkerSource } from '../pwa/plugin.ts';

function parseWorker(source: string) {
  const dir = mkdtempSync(join(tmpdir(), 'wospis-sw-'));
  const file = join(dir, 'sw.js');
  writeFileSync(file, source);
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

test('dev and production service workers parse', () => {
  parseWorker(devWorkerSource());
  const production = productionWorkerSource(['/', '/index.html', '/assets/app.js']);
  parseWorker(production);
  if (!production.includes('wospis-offline')) {
    throw new Error('Production worker must read the device copy saved while online.');
  }
  if (!devWorkerSource().includes('navigator.onLine')) {
    throw new Error('Dev worker must serve the saved copy when the device is offline.');
  }
});
