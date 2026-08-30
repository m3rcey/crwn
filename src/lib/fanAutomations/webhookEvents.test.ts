import { describe, it, expect } from 'vitest';
import { parseMetaWebhookEvents } from './webhookEvents';

describe('parseMetaWebhookEvents', () => {
  it('parses an Instagram Login comment event (direct field/value)', () => {
    const events = parseMetaWebhookEvents({
      object: 'instagram',
      entry: [{
        id: '178900',
        time: 1,
        field: 'comments',
        value: { id: 'c-1', text: 'vault', from: { id: 'u-1', username: 'fan' }, media: { id: 'm-1' } },
      }],
    });
    expect(events).toEqual([{
      provider: 'instagram', providerAccountId: '178900', commentId: 'c-1',
      mediaId: 'm-1', fromId: 'u-1', fromUsername: 'fan', text: 'vault',
    }]);
  });

  it('parses the changes[] wrapper variant too', () => {
    const events = parseMetaWebhookEvents({
      object: 'instagram',
      entry: [{
        id: '178900',
        changes: [{ field: 'comments', value: { id: 'c-2', text: 'hi', from: { id: 'u' }, media: { id: 'm' } } }],
      }],
    });
    expect(events).toHaveLength(1);
    expect(events[0].commentId).toBe('c-2');
  });

  it('parses a Facebook Page feed comment add', () => {
    const events = parseMetaWebhookEvents({
      object: 'page',
      entry: [{
        id: 'page-9',
        changes: [{
          field: 'feed',
          value: { item: 'comment', verb: 'add', comment_id: 'p9_c1', post_id: 'p9_post', from: { id: 'u-2', name: 'Fan Name' }, message: 'drop' },
        }],
      }],
    });
    expect(events).toEqual([{
      provider: 'facebook', providerAccountId: 'page-9', commentId: 'p9_c1',
      mediaId: 'p9_post', fromId: 'u-2', fromUsername: 'Fan Name', text: 'drop',
    }]);
  });

  it('ignores non-comment feed items and non-add verbs', () => {
    const events = parseMetaWebhookEvents({
      object: 'page',
      entry: [{
        id: 'page-9',
        changes: [
          { field: 'feed', value: { item: 'like', verb: 'add' } },
          { field: 'feed', value: { item: 'comment', verb: 'remove', comment_id: 'gone' } },
          { field: 'feed', value: { item: 'comment', verb: 'edited', comment_id: 'edited' } },
        ],
      }],
    });
    expect(events).toEqual([]);
  });

  it('drops malformed bodies instead of guessing', () => {
    expect(parseMetaWebhookEvents(null)).toEqual([]);
    expect(parseMetaWebhookEvents({})).toEqual([]);
    expect(parseMetaWebhookEvents({ object: 'user', entry: [{}] })).toEqual([]);
    expect(parseMetaWebhookEvents({ object: 'instagram', entry: [{ field: 'comments', value: { text: 'no id' } }] })).toEqual([]);
    expect(parseMetaWebhookEvents({ object: 'instagram', entry: [{ id: 'a', field: 'mentions', value: { id: 'c' } }] })).toEqual([]);
  });

  it('numeric provider ids are stringified, not dropped', () => {
    const events = parseMetaWebhookEvents({
      object: 'instagram',
      entry: [{ id: 178900, field: 'comments', value: { id: 'c-1', text: 'x', from: { id: 5 }, media: { id: 7 } } }],
    });
    expect(events[0].providerAccountId).toBe('178900');
    expect(events[0].fromId).toBe('5');
    expect(events[0].mediaId).toBe('7');
  });
});
