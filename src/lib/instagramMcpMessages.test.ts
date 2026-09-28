import { describe, it, expect, vi } from 'vitest';
// The local Instagram MCP server's DM helpers (tools/instagram-mcp). Shapes below mirror what
// graph.instagram.com v26.0 actually returned on 2026-09-28: the messages edge drops
// `attachments`, GET /{message-id} returns them.
import { enrichMessages, findConversation, stripPaging } from '../../tools/instagram-mcp/messages.mjs';

const ME = '17841425176351221';
const FAN = '1568335765312141';
const TOKEN = 'fixture-not-a-real-token';

const inbound = { id: 'm1', created_time: '2026-09-28T15:26:20+0000', from: { username: 'fan', id: FAN }, to: { data: [{ username: 'thecrwnapp', id: ME }] }, message: 'What does your company do?' };
const bareCard = { id: 'm2', created_time: '2026-09-28T15:32:39+0000', from: { username: 'thecrwnapp', id: ME }, to: { data: [{ username: 'fan', id: FAN }] }, message: '' };
const cardDetail = {
  ...bareCard,
  is_unsupported: false,
  attachments: {
    data: [{ generic_template: { title: 'Your plan is ready', cta: [{ title: 'Open it', type: 'web_url' }] } }],
    paging: { cursors: { before: 'QVFI', after: 'QVFI' }, next: `https://graph.instagram.com/v26.0/x?access_token=${TOKEN}` },
  },
};

describe('enrichMessages', () => {
  it('returns inbound text from the edge as-is, labelled inbound, with no detail call', async () => {
    const graph = vi.fn();
    const [m] = await enrichMessages([inbound], graph, ME);
    expect(m.message).toBe('What does your company do?');
    expect(m.from.username).toBe('fan');
    expect(m.created_time).toBe(inbound.created_time);
    expect(m.direction).toBe('inbound');
    expect(graph).not.toHaveBeenCalled();
  });

  it('re-fetches a bare message by id and recovers the card the edge dropped', async () => {
    const graph = vi.fn().mockResolvedValue(cardDetail);
    const [m] = await enrichMessages([bareCard], graph, ME);
    expect(graph).toHaveBeenCalledTimes(1);
    expect(graph.mock.calls[0][0]).toBe('m2');
    expect(graph.mock.calls[0][1].fields).toContain('attachments');
    expect(m.attachments.data[0].generic_template.title).toBe('Your plan is ready');
    expect(m.direction).toBe('outbound');
  });

  it('mixed thread: only the bare message costs a detail call, and order is preserved', async () => {
    const withShare = { ...inbound, id: 'm3', message: '', shares: { data: [{ link: 'x' }] } };
    const graph = vi.fn().mockResolvedValue(cardDetail);
    const out = await enrichMessages([bareCard, inbound, withShare], graph, ME);
    expect(graph).toHaveBeenCalledTimes(1);
    expect(out.map((m: { id: string }) => m.id)).toEqual(['m2', 'm1', 'm3']);
  });

  it('a failed detail fetch keeps the message and the rest of the thread', async () => {
    const graph = vi.fn().mockRejectedValue(new Error('Graph 400 code 100: Unsupported get request'));
    const out = await enrichMessages([bareCard, inbound], graph, ME);
    expect(out).toHaveLength(2);
    expect(out[0].detail_error).toMatch(/code 100/);
    expect(out[1].message).toBe('What does your company do?');
  });

  it('direction is unknown, never guessed, when the account id is unavailable', async () => {
    const [m] = await enrichMessages([inbound], vi.fn(), null);
    expect(m.direction).toBe('unknown');
  });

  it('never returns a paging URL (they carry the token)', async () => {
    const graph = vi.fn().mockResolvedValue({ ...cardDetail, reactions: { data: [], paging: { next: `https://x?access_token=${TOKEN}` } } });
    const out = await enrichMessages([bareCard], graph, ME);
    const text = JSON.stringify(out);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('paging');
  });
});

describe('stripPaging', () => {
  it('removes nested paging at any depth and keeps everything else', () => {
    expect(stripPaging({ a: { paging: { next: 'u' }, data: [{ b: 1, paging: {} }] } })).toEqual({ a: { data: [{ b: 1 }] } });
  });
});

describe('findConversation', () => {
  const conv = (id: string, username: string) => ({ id, updated_time: 't', participants: { data: [{ username: 'thecrwnapp', id: ME }, { username, id: 'u' + id }] } });

  it('finds a thread by username, case- and @-insensitive, across pages', async () => {
    const graph = vi.fn()
      .mockResolvedValueOnce({ data: [conv('c1', 'someone')], paging: { next: 'u', cursors: { after: 'CUR1' } } })
      .mockResolvedValueOnce({ data: [conv('c2', 'JRockTheGypzie')] });
    const hit = await findConversation('@jrockthegypzie', graph);
    expect(hit?.id).toBe('c2');
    expect(graph.mock.calls[1][1].after).toBe('CUR1');
  });

  it('returns null when the list ends without a match', async () => {
    const graph = vi.fn().mockResolvedValueOnce({ data: [conv('c1', 'someone')] });
    expect(await findConversation('nobody', graph)).toBeNull();
    expect(graph).toHaveBeenCalledTimes(1);
  });

  it('stops at maxPages instead of walking the whole inbox', async () => {
    const graph = vi.fn().mockResolvedValue({ data: [], paging: { next: 'u', cursors: { after: 'C' } } });
    expect(await findConversation('nobody', graph, { maxPages: 3 })).toBeNull();
    expect(graph).toHaveBeenCalledTimes(3);
  });

  it('refuses an empty username', async () => {
    await expect(findConversation('@', vi.fn())).rejects.toThrow(/required/);
  });
});
