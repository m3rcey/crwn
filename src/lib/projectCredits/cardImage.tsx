// The credit card artwork, as an ImageResponse. Kept apart from the route so it can be rendered
// and LOOKED AT without a database (scripts/render-credit-card.mjs), which is how a card gets
// checked before anyone posts it. Typographic only: no generated imagery, no text inside the art.

import { ImageResponse } from 'next/og';
import { CREDIT_LEVEL_LABEL, creditLabel, creditsPath, type CreditLevel } from './credits';

const GOLD = '#D4AF37';
const INK = '#0D0D0D';
const CARD = '#1A1A1A';
const MUTED = 'rgba(255,255,255,0.45)';

export interface CreditCardInput {
  artistName: string;
  albumTitle: string;
  level: CreditLevel;
  number: number;
  name: string;
  /** Shown at the foot: where the credit can be checked. */
  link: string;
  /** A png/jpeg data URL, or null for a plain panel. */
  art: string | null;
  story: boolean;
  /** The credit's short ID (creditCode), printed so it can be checked against its CRWN page. */
  code?: string | null;
  /** A QR code (png data URL) that opens the credit's own page on thecrwn.app. That page, not the
   *  picture, is the proof: an edited or generated image either has no working code or opens a
   *  page that shows a different name. */
  qr?: string | null;
}

/** The QR for a credit page, as a png data URL. Dark on white: phone cameras read it reliably. */
export async function creditQr(url: string): Promise<string | null> {
  try {
    const QRCode = (await import('qrcode')).default;
    return await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#0D0D0D', light: '#FFFFFF' } });
  } catch {
    return null;
  }
}

/**
 * The address printed at the foot of the card: a page that EXISTS, because the card is proof. The
 * story names the project's credits page, where anyone can find the name. The link preview already
 * sits on the card's own URL, so it names the artist's page, which fits its narrow column.
 */
export function cardFooterLink(artistSlug: string, albumTitle: string, story: boolean): string {
  return story ? `thecrwn.app${creditsPath(artistSlug, albumTitle)}` : `thecrwn.app/${artistSlug}`;
}

export const STORY_SIZE = { width: 1080, height: 1920 };
export const PREVIEW_SIZE = { width: 1200, height: 630 };

export function creditCardImage(c: CreditCardInput, headers?: Record<string, string>): ImageResponse {
  if (c.story) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: INK,
            color: 'white',
            padding: '110px 80px 80px',
          }}
        >
          {c.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.art} width={700} height={700} style={{ borderRadius: 24, objectFit: 'cover' }} alt="" />
          ) : (
            <div style={{ width: 700, height: 700, borderRadius: 24, background: CARD, display: 'flex' }} />
          )}
          <div style={{ marginTop: 70, fontSize: 40, letterSpacing: 8, color: GOLD, display: 'flex' }}>
            {c.artistName.toUpperCase()}
          </div>
          <div style={{ marginTop: 16, fontSize: 64, fontWeight: 700, textAlign: 'center', display: 'flex' }}>
            {c.albumTitle}
          </div>
          <div style={{ marginTop: 80, fontSize: 40, letterSpacing: 6, color: GOLD, display: 'flex' }}>
            {CREDIT_LEVEL_LABEL[c.level].toUpperCase()}
          </div>
          <div style={{ fontSize: 220, fontWeight: 700, color: GOLD, lineHeight: 1, display: 'flex' }}>
            {`#${c.number}`}
          </div>
          <div style={{ marginTop: 30, fontSize: 72, textAlign: 'center', display: 'flex' }}>{c.name}</div>
          <div style={{ marginTop: 'auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 620 }}>
              <div style={{ fontSize: 26, color: GOLD, letterSpacing: 3, display: 'flex' }}>SCAN TO VERIFY ON CRWN</div>
              {c.code ? <div style={{ marginTop: 8, fontSize: 34, color: 'white', letterSpacing: 2, display: 'flex' }}>{`Credit ID ${c.code}`}</div> : null}
              <div style={{ marginTop: 8, fontSize: 24, color: MUTED, display: 'flex' }}>{c.link}</div>
            </div>
            {c.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.qr} width={200} height={200} style={{ borderRadius: 12 }} alt="" />
            ) : null}
          </div>
        </div>
      ),
      { ...STORY_SIZE, headers },
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: INK, color: 'white' }}>
        {c.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.art} width={630} height={630} style={{ objectFit: 'cover' }} alt="" />
        ) : (
          <div style={{ width: 630, height: 630, background: CARD, display: 'flex' }} />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 50 }}>
          <div style={{ fontSize: 26, letterSpacing: 5, color: GOLD, display: 'flex' }}>{c.artistName.toUpperCase()}</div>
          <div style={{ marginTop: 8, fontSize: 40, fontWeight: 700, display: 'flex' }}>{c.albumTitle}</div>
          <div style={{ marginTop: 40, fontSize: 30, color: GOLD, display: 'flex' }}>{creditLabel(c.level, c.number)}</div>
          <div style={{ marginTop: 10, fontSize: 52, display: 'flex' }}>{c.name}</div>
          {c.code ? <div style={{ marginTop: 30, fontSize: 22, color: 'white', display: 'flex' }}>{`Credit ID ${c.code}, verified on CRWN`}</div> : null}
          <div style={{ marginTop: 10, fontSize: 22, color: MUTED, display: 'flex' }}>{c.link}</div>
        </div>
      </div>
    ),
    { ...PREVIEW_SIZE, headers },
  );
}
