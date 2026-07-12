// Outbound ManyChat. The ONLY channel that reliably reaches a cold Instagram lead.
//
// Read this before you rely on it: a lead who came from an Instagram comment almost never
// has an email. We never asked for one. So "send them a nurture email" is a fantasy for the
// majority of this funnel, and the Instagram DM is the real channel.
//
// META'S MESSAGING WINDOW IS REAL AND WE DO NOT CONTROL IT.
// Instagram permits a business to message a user for 24 hours after that user's last
// interaction. Outside that window, Meta rejects the send. No amount of CRWN code changes
// this. So:
//
//   - we attempt the send
//   - if Meta/ManyChat rejects it, we record the error code and DO NOT retry forever
//   - we do not pretend the message was delivered
//   - we do not attempt to message Instagram directly, ever (that is Meta's API, not ours,
//     and going around ManyChat here would be both a ToS problem and a security problem)
//
// If MANYCHAT_API_TOKEN is unset, this is a DISABLED ADAPTER: it reports "not configured"
// and the dispatcher records that outcome honestly rather than silently dropping the send.

const MANYCHAT_API = 'https://api.manychat.com';

export type SendOutcome =
  | { ok: true; providerId: string | null }
  | { ok: false; code: 'not_configured' | 'outside_window' | 'rejected' | 'network'; detail: string };

export function isManyChatOutboundConfigured(): boolean {
  const t = process.env.MANYCHAT_API_TOKEN;
  return !!t && t.length > 10;
}

/**
 * Send a text message to a ManyChat contact.
 *
 * `messageTag` is how you message OUTSIDE the 24-hour window, and it is not a loophole: Meta
 * only permits specific tags for specific purposes and misusing one gets an app banned. We
 * leave it unset by default, which means in-window sends only. Set
 * MANYCHAT_MESSAGE_TAG only if you have confirmed with Meta which tag your use case
 * legitimately qualifies for.
 */
export async function sendManyChatMessage(
  contactId: string,
  text: string,
): Promise<SendOutcome> {
  const token = process.env.MANYCHAT_API_TOKEN;

  if (!token || token.length <= 10) {
    return { ok: false, code: 'not_configured', detail: 'MANYCHAT_API_TOKEN unset' };
  }

  const tag = process.env.MANYCHAT_MESSAGE_TAG || undefined;

  const body: Record<string, unknown> = {
    subscriber_id: contactId,
    data: {
      version: 'v2',
      content: {
        messages: [{ type: 'text', text: clamp(text) }],
      },
    },
  };
  if (tag) body.message_tag = tag;

  try {
    const res = await fetch(`${MANYCHAT_API}/fb/sending/sendContent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // A dispatcher run must not hang on a slow provider.
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message_id?: string };
      return { ok: true, providerId: json.message_id ?? null };
    }

    const detail = (await res.text().catch(() => '')).slice(0, 200);

    // Meta closed the window. This is EXPECTED, not an error to retry: the window does not
    // reopen on a schedule, it reopens when the artist messages us again. Retrying a
    // 24-hour-window rejection every day forever is how you burn an app's reputation.
    if (/outside.*window|24.?hour|messaging_window|policy/i.test(detail)) {
      return { ok: false, code: 'outside_window', detail: detail.slice(0, 120) };
    }

    return { ok: false, code: 'rejected', detail: `${res.status}: ${detail.slice(0, 120)}` };
  } catch (err) {
    return {
      ok: false,
      code: 'network',
      detail: err instanceof Error ? err.name : 'unknown',
    };
  }
}

/** Instagram DMs are not essays. */
const MAX_CHARS = 900;

function clamp(t: string): string {
  const s = (t || '').trim();
  return s.length > MAX_CHARS ? s.slice(0, MAX_CHARS - 1).trimEnd() + '…' : s;
}
