// TODO.md: Josh never runs a command (founder, 2026-10-03: "i shouldnt have to run npx commands
// anymore"). His sections hold SQL migrations (a file he opens and runs), decisions, and actions
// only his accounts can do (a dashboard, a token, a secret). Anything runnable is Claude's: it goes
// under "On Claude's plate", and Josh's item ends with "tell Claude". Mutation-tested 2026-10-03.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const RUNNABLE = /(^|[\s`(])(npx |npm run |npm test|node scripts\/|tsx scripts\/|bash -c |bash scripts\/|scripts\/dev\/crwn )/;

export function commandsHandedToJosh(todo: string): string[] {
  const end = todo.indexOf("\n## On Claude's plate");
  const josh = end === -1 ? todo : todo.slice(0, end);
  return josh
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => RUNNABLE.test(line))
    .map(({ line, n }) => `TODO.md:${n}: ${line.trim()}`);
}

describe('TODO.md hands Josh no commands', () => {
  it('no runnable command appears above "On Claude\'s plate"', () => {
    expect(
      commandsHandedToJosh(readFileSync('TODO.md', 'utf8')),
      'A command in Josh\'s sections. Run it yourself, or move it under "On Claude\'s plate" and end his item with "tell Claude".',
    ).toEqual([]);
  });

  it('catches the shapes that used to be there, and leaves Claude\'s plate alone', () => {
    const sample = [
      '## Do Now',
      '- [ ] check it with:',
      '    npx tsx scripts/project-credits.mjs princedre',
      '- [ ] or `npm run verify:migrations`',
      '- [ ] node scripts/queue-carousels.mjs --range 31-40',
      "## On Claude's plate (not yours)",
      '- npx tsx scripts/project-credits.mjs princedre --apply',
    ].join('\n');
    expect(commandsHandedToJosh(sample)).toHaveLength(3);
  });
});
