import { describe, expect, it } from 'vitest';
import { getLeadMagnet } from './leadMagnets/registry';
import { prefillFromQuery } from './leadMagnets/resumeInputs';
import { PROSPECT_LINKS, PROSPECT_TOOL_SLUG, prospectSearch } from './prospectLinks';

const config = getLeadMagnet(PROSPECT_TOOL_SLUG)!;

describe('named prospect links', () => {
  it('slugs are unique and URL-safe', () => {
    const slugs = PROSPECT_LINKS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  for (const p of PROSPECT_LINKS) {
    it(`${p.slug}: every answer survives the calculator's allowlist and it opens on the result`, () => {
      const search = new URLSearchParams(prospectSearch(p));
      const values = prefillFromQuery(config, search) as Record<string, unknown>;
      // A typo'd key or an option the tool does not offer would be silently dropped.
      expect(Object.keys(values).sort()).toEqual(Object.keys(p.answers).sort());
      for (const input of config.inputs) if (input.required) expect(values[input.key]).toBeDefined();
      expect(search.get('show')).toBe('result');
      if (p.from) expect(config.entryContexts?.[p.from]).toBeDefined();
      expect(`${p.name}: your CRWN numbers`.length).toBeLessThanOrEqual(40);
    });
  }
});
