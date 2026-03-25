/**
 * Twilio SMS integration with compliance guardrails.
 * Configurable — works without credentials (logs to console in dev).
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const isConfigured = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN);

// US area code to IANA timezone mapping (simplified — covers major regions)
const AREA_CODE_TIMEZONE: Record<string, string> = {
  // Eastern
  '201': 'America/New_York', '202': 'America/New_York', '203': 'America/New_York',
  '212': 'America/New_York', '215': 'America/New_York', '216': 'America/New_York',
  '301': 'America/New_York', '302': 'America/New_York', '305': 'America/New_York',
  '313': 'America/New_York', '315': 'America/New_York', '321': 'America/New_York',
  '347': 'America/New_York', '404': 'America/New_York', '407': 'America/New_York',
  '410': 'America/New_York', '412': 'America/New_York', '413': 'America/New_York',
  '414': 'America/New_York', '440': 'America/New_York', '443': 'America/New_York',
  '484': 'America/New_York', '516': 'America/New_York', '518': 'America/New_York',
  '551': 'America/New_York', '561': 'America/New_York', '570': 'America/New_York',
  '571': 'America/New_York', '585': 'America/New_York', '603': 'America/New_York',
  '607': 'America/New_York', '610': 'America/New_York', '614': 'America/New_York',
  '617': 'America/New_York', '631': 'America/New_York', '646': 'America/New_York',
  '678': 'America/New_York', '703': 'America/New_York', '704': 'America/New_York',
  '716': 'America/New_York', '717': 'America/New_York', '718': 'America/New_York',
  '724': 'America/New_York', '727': 'America/New_York', '732': 'America/New_York',
  '754': 'America/New_York', '757': 'America/New_York', '770': 'America/New_York',
  '772': 'America/New_York', '774': 'America/New_York', '781': 'America/New_York',
  '786': 'America/New_York', '802': 'America/New_York', '804': 'America/New_York',
  '813': 'America/New_York', '828': 'America/New_York', '843': 'America/New_York',
  '845': 'America/New_York', '856': 'America/New_York', '860': 'America/New_York',
  '862': 'America/New_York', '863': 'America/New_York', '864': 'America/New_York',
  '904': 'America/New_York', '908': 'America/New_York', '910': 'America/New_York',
  '914': 'America/New_York', '917': 'America/New_York', '919': 'America/New_York',
  '929': 'America/New_York', '941': 'America/New_York', '954': 'America/New_York',
  '973': 'America/New_York',
  // Central
  '205': 'America/Chicago', '210': 'America/Chicago', '214': 'America/Chicago',
  '217': 'America/Chicago', '218': 'America/Chicago', '219': 'America/Chicago',
  '225': 'America/Chicago', '228': 'America/Chicago', '251': 'America/Chicago',
  '252': 'America/Chicago', '254': 'America/Chicago', '256': 'America/Chicago',
  '262': 'America/Chicago', '269': 'America/Chicago', '270': 'America/Chicago',
  '281': 'America/Chicago', '309': 'America/Chicago', '312': 'America/Chicago',
  '314': 'America/Chicago', '316': 'America/Chicago', '317': 'America/Chicago',
  '318': 'America/Chicago', '319': 'America/Chicago', '320': 'America/Chicago',
  '325': 'America/Chicago', '331': 'America/Chicago', '334': 'America/Chicago',
  '337': 'America/Chicago', '361': 'America/Chicago', '405': 'America/Chicago',
  '409': 'America/Chicago', '417': 'America/Chicago', '430': 'America/Chicago',
  '432': 'America/Chicago', '469': 'America/Chicago', '479': 'America/Chicago',
  '501': 'America/Chicago', '502': 'America/Chicago', '504': 'America/Chicago',
  '507': 'America/Chicago', '512': 'America/Chicago', '513': 'America/Chicago',
  '515': 'America/Chicago', '563': 'America/Chicago', '573': 'America/Chicago',
  '601': 'America/Chicago', '608': 'America/Chicago', '612': 'America/Chicago',
  '615': 'America/Chicago', '618': 'America/Chicago', '620': 'America/Chicago',
  '630': 'America/Chicago', '636': 'America/Chicago', '651': 'America/Chicago',
  '660': 'America/Chicago', '662': 'America/Chicago', '682': 'America/Chicago',
  '708': 'America/Chicago', '713': 'America/Chicago', '715': 'America/Chicago',
  '731': 'America/Chicago', '737': 'America/Chicago', '763': 'America/Chicago',
  '769': 'America/Chicago', '773': 'America/Chicago', '779': 'America/Chicago',
  '806': 'America/Chicago', '815': 'America/Chicago', '816': 'America/Chicago',
  '817': 'America/Chicago', '830': 'America/Chicago', '832': 'America/Chicago',
  '847': 'America/Chicago', '850': 'America/Chicago', '859': 'America/Chicago',
  '870': 'America/Chicago', '901': 'America/Chicago', '903': 'America/Chicago',
  '913': 'America/Chicago', '918': 'America/Chicago', '920': 'America/Chicago',
  '936': 'America/Chicago', '940': 'America/Chicago', '952': 'America/Chicago',
  '956': 'America/Chicago', '972': 'America/Chicago', '979': 'America/Chicago',
  // Mountain
  '303': 'America/Denver', '307': 'America/Denver', '385': 'America/Denver',
  '406': 'America/Denver', '435': 'America/Denver', '480': 'America/Denver',
  '505': 'America/Denver', '520': 'America/Denver', '575': 'America/Denver',
  '602': 'America/Denver', '623': 'America/Denver', '719': 'America/Denver',
  '720': 'America/Denver', '801': 'America/Denver', '928': 'America/Denver',
  '970': 'America/Denver',
  // Pacific
  '206': 'America/Los_Angeles', '209': 'America/Los_Angeles', '213': 'America/Los_Angeles',
  '253': 'America/Los_Angeles', '310': 'America/Los_Angeles', '323': 'America/Los_Angeles',
  '360': 'America/Los_Angeles', '408': 'America/Los_Angeles', '415': 'America/Los_Angeles',
  '424': 'America/Los_Angeles', '425': 'America/Los_Angeles', '442': 'America/Los_Angeles',
  '503': 'America/Los_Angeles', '509': 'America/Los_Angeles', '510': 'America/Los_Angeles',
  '530': 'America/Los_Angeles', '541': 'America/Los_Angeles', '559': 'America/Los_Angeles',
  '562': 'America/Los_Angeles', '619': 'America/Los_Angeles', '626': 'America/Los_Angeles',
  '650': 'America/Los_Angeles', '657': 'America/Los_Angeles', '661': 'America/Los_Angeles',
  '669': 'America/Los_Angeles', '707': 'America/Los_Angeles', '714': 'America/Los_Angeles',
  '747': 'America/Los_Angeles', '760': 'America/Los_Angeles', '775': 'America/Los_Angeles',
  '805': 'America/Los_Angeles', '808': 'Pacific/Honolulu',
  '818': 'America/Los_Angeles', '831': 'America/Los_Angeles', '858': 'America/Los_Angeles',
  '907': 'America/Anchorage', '909': 'America/Los_Angeles', '916': 'America/Los_Angeles',
  '925': 'America/Los_Angeles', '949': 'America/Los_Angeles', '951': 'America/Los_Angeles',
  '971': 'America/Los_Angeles',
};

/**
 * Get timezone from US phone number area code.
 * Falls back to Eastern (most restrictive) if unknown.
 */
export function getTimezoneFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Handle +1 prefix
  const areaCode = digits.length === 11 && digits.startsWith('1')
    ? digits.substring(1, 4)
    : digits.substring(0, 3);
  return AREA_CODE_TIMEZONE[areaCode] || 'America/New_York';
}

/**
 * Check if current time is in quiet hours (9pm-9am) for a timezone.
 */
export function isInQuietHours(timezone: string | null): boolean {
  const tz = timezone || 'America/New_York';
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
    const hour = parseInt(formatter.format(now));
    return hour < 9 || hour >= 21;
  } catch {
    // Invalid timezone — default to restrictive
    return true;
  }
}

/**
 * Calculate next 9am in the fan's timezone for deferred sends.
 */
export function getNext9am(timezone: string | null): Date {
  const tz = timezone || 'America/New_York';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');

  // If before 9am, next 9am is today; otherwise tomorrow
  const hoursUntil9am = hour < 9 ? (9 - hour) : (24 - hour + 9);
  return new Date(now.getTime() + hoursUntil9am * 60 * 60 * 1000);
}

/**
 * Approximate distance between two US cities using lat/lng.
 * Returns miles. Simple Haversine formula.
 */
export function distanceMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// SMS categories allowed by platform
export const SMS_CATEGORIES = [
  { value: 'show_nearby', label: 'Show Nearby', description: 'Live show in the fan\'s area' },
  { value: 'new_release', label: 'New Release', description: 'New album or single drop' },
  { value: 'exclusive_drop', label: 'Exclusive Drop', description: 'Limited merch or exclusive content' },
  { value: 'milestone', label: 'Milestone', description: 'Artist milestone fans helped achieve' },
  { value: 'event_reminder', label: 'Event Reminder', description: 'Reminder for booked event' },
] as const;

export type SmsCategory = typeof SMS_CATEGORIES[number]['value'];

// Per-fan limits
export const MAX_SMS_PER_FAN_PER_MONTH = 4;
export const MAX_SMS_PER_FAN_PER_DAY = 1;

// Allowed MMS media types (Twilio-supported image formats)
export const MMS_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const MMS_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — Twilio limit

/**
 * Send an SMS or MMS via Twilio. Falls back to console.log if Twilio is not configured.
 * Pass mediaUrl to send as MMS (image attached to message).
 */
export async function sendSms(
  to: string,
  body: string,
  from: string,
  mediaUrl?: string | null
): Promise<{ success: boolean; sid?: string; error?: string }> {
  if (!isConfigured) {
    console.log('[SMS Stub]', { to, from, body: body.substring(0, 50) + '...', mediaUrl: mediaUrl || null });
    return { success: true, sid: `stub_${Date.now()}` };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const params = new URLSearchParams({
      To: to,
      From: from,
      Body: body,
      StatusCallback: 'https://thecrwn.app/api/sms/status',
    });

    // Attach media for MMS
    if (mediaUrl) {
      params.append('MediaUrl', mediaUrl);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const data = await res.json();
    if (data.sid) {
      return { success: true, sid: data.sid };
    }
    return { success: false, error: data.message || 'Unknown Twilio error' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to send SMS' };
  }
}
