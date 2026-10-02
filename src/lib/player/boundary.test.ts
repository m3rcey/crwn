import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The playback engine owns the app player's <audio>. React only subscribes. These assertions
// fail if the old shape comes back: a provider that creates the element (one per mount) or
// pauses it on unmount (a remount silences the music), or an `ended` path that waits on the
// network before play().
const read = (p: string) => readFileSync(resolve(__dirname, '..', '..', '..', p), 'utf8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('player ownership boundary', () => {
  const provider = code(read('src/hooks/usePlayer.tsx'));

  it('the React provider never creates, pauses or replaces a media element itself', () => {
    expect(provider).not.toMatch(/new Audio\s*\(/);
    expect(provider).not.toMatch(/document\.createElement\(\s*['"]audio/);
    // Controls are forwarded to the engine (`engine?.pause()`); an element is never touched.
    expect(provider).not.toMatch(/(audio\w*|media\w*|\.current\??)\.pause\(\)/i);
    expect(provider).not.toMatch(/\.src\s*=/);
    expect(provider).not.toMatch(/HTMLAudioElement|audioRef/);
  });

  it('the engine is a per-tab singleton', () => {
    const env = code(read('src/lib/player/browserEnv.ts'));
    expect(env).toMatch(/if \(window\.__crwnPlayerEngine\) return window\.__crwnPlayerEngine;/);
    expect((env.match(/new PlaybackEngine\(/g) ?? []).length).toBe(1);
  });

  it('the `ended` handler starts the next track without awaiting anything', () => {
    const engine = code(read('src/lib/player/engine.ts'));
    const body = engine.slice(engine.indexOf('private onEnded()'), engine.indexOf('private onTimeUpdate()'));
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/\bawait\b|\.then\(|setTimeout|requestAnimationFrame/);
    expect(body).toMatch(/this\.load\(i, \{ autoplay: true, reason: 'ended' \}\)/);
  });
});
