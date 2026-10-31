import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('notification sound unlock', () => {
  it('mutes clips while priming so open/PWA unlock is silent', () => {
    const source = readFileSync(join(root, 'src/sounds.ts'), 'utf8');
    assert.match(source, /el\.muted = true/);
    assert.match(source, /el\.volume = 0/);
    assert.match(source, /NOTICE_COOLDOWN_MS/);
    assert.match(source, /now - lastNoticeAt < NOTICE_COOLDOWN_MS/);
  });

  it('does not chime for notification backlog on first open', () => {
    const source = readFileSync(join(root, 'src/components/NotificationBell.tsx'), 'utf8');
    assert.match(source, /const isBaseline = seenIds\.current === null/);
    assert.match(source, /createdAt < sessionOpenedAt - 5000/);
    assert.match(source, /Claim ids before side effects/);
  });
});
