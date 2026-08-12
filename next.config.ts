import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

/**
 * The Supabase project origin, derived from the SAME env var the browser client
 * uses, so a staging/branch project gets the right origin instead of a wildcard.
 * Falls back to the production project ref if the var is missing at build time.
 */
const supabaseUrl = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  } catch {
    return new URL('https://ecpqtuidtsncjfwtkvwc.supabase.co');
  }
})();
const supabaseOrigin = supabaseUrl.origin;
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, 'ws');

/**
 * LiveKit Cloud. `NEXT_PUBLIC_LIVEKIT_URL` is a wss:// project URL
 * (wss://crwn-<id>.livekit.cloud). LiveKit Cloud answers the initial connect on
 * that host and then hands the client a REGIONAL host under the same apex, so
 * the vendor apex is listed alongside the exact project host. This is a scoped
 * vendor allowance, not a catch-all.
 */
const livekitWs = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://crwn-5tfwmipy.livekit.cloud';
const livekitHttps = livekitWs.replace(/^ws/, 'http');

/** Public R2 media domain (legacy locators; the domain itself is currently disabled). */
const r2PublicOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://crwn-media.r2.dev').origin;
  } catch {
    return 'https://crwn-media.r2.dev';
  }
})();

/**
 * Content-Security-Policy, REPORT-ONLY.
 *
 * Every origin below was established by reading the code, not assumed:
 *
 *  - script-src: NO external origin. There is no third-party script tag in the
 *    app. `@stripe/stripe-js` is not a dependency (only the server-side `stripe`
 *    SDK), Stripe Checkout and Connect are top-level redirects, and
 *    `react-calendly`'s InlineWidget renders a plain iframe rather than loading
 *    Calendly's widget.js. So the only script origin is 'self'.
 *  - style-src: fonts.googleapis.com is a stylesheet <link> in
 *    src/app/embed/[trackId]/layout.tsx. assets.calendly.com serves
 *    react-calendly's widget.css.
 *  - font-src: fonts.gstatic.com is what the Google stylesheet above pulls.
 *    The main app font (Inter) is self-hosted by next/font, so it needs nothing.
 *  - img-src: the Supabase project origin (public avatars/album-art buckets) and
 *    assets.calendly.com (close-icon.svg). Private R2 images are served through
 *    the same-origin /api/live/thumbnail redirect, and CSP does not re-check a
 *    redirect target, so R2 is not needed here.
 *  - media-src: *.r2.cloudflarestorage.com is REQUIRED: /api/live/vod returns a
 *    signed R2 URL as JSON and the client sets it as a <video src>, so the
 *    browser fetches R2 directly. The R2 account id is not in the client bundle,
 *    hence the single-label wildcard on the vendor apex.
 *  - connect-src: Supabase REST/Auth (https) + Realtime (wss), LiveKit,
 *    presigned R2 PUT uploads from the browser (live VOD + producer
 *    submissions), and 'self' for every analytics beacon (all beacons are
 *    same-origin: /api/funnel/track, /api/tier-events, /api/lead-magnets/analytics).
 *  - frame-src: calendly.com (booking InlineWidget) and 'self' (the onboarding
 *    live preview frames the artist's own page).
 *
 * WHAT MUST CHANGE BEFORE THIS CAN BE ENFORCED:
 *  1. script-src still carries 'unsafe-inline', which means this policy provides
 *     NO XSS containment yet. The App Router injects inline bootstrap scripts
 *     (self.__next_f.push RSC chunks), so removing it requires a per-request
 *     nonce: generate one in src/middleware.ts, put it on the CSP header there
 *     (headers() in this file is static and cannot mint a per-request value),
 *     and let Next propagate it to its own script tags. That is the blocker.
 *     Note that once a nonce is present, 'unsafe-inline' is IGNORED by browsers,
 *     so the migration is one step, not a gradual one.
 *  2. style-src 'unsafe-inline' is likely permanent: React inline style props and
 *     Next's injected <style> blocks are used throughout. Enforcing style-src
 *     without 'unsafe-inline' would need a full styling refactor and buys little.
 *
 * REPORTING: there is deliberately NO report-uri / report-to, because CRWN has no
 * collector endpoint. Adding one means a new route (e.g. /api/csp-report) that
 * accepts unauthenticated POSTs and therefore needs its own rate limit and size
 * cap, plus a Reporting-Endpoints header. Until that exists, this header only
 * surfaces violations in the browser console of whoever is looking. It is a
 * staging step toward enforcement, not a protection for users. Do not describe it
 * as one.
 */
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  // 'unsafe-eval' only in dev: the Turbopack dev runtime needs it. Production does not.
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://assets.calendly.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${supabaseOrigin} https://assets.calendly.com`,
  `media-src 'self' data: blob: ${supabaseOrigin} ${r2PublicOrigin} https://*.r2.cloudflarestorage.com`,
  [
    "connect-src 'self'",
    supabaseOrigin,
    supabaseWsOrigin,
    livekitWs,
    livekitHttps,
    'wss://*.livekit.cloud',
    'https://*.r2.cloudflarestorage.com',
    r2PublicOrigin,
  ].join(' '),
  "worker-src 'self' blob:",
  "frame-src 'self' https://calendly.com",
  "manifest-src 'self'",
].join('; ');

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // SAMEORIGIN, not DENY, so the onboarding live preview can frame the
          // artist's OWN page (`/{slug}?embed=1`) while they build it. This is
          // not a relaxation against attackers: `frame-ancestors 'self'` below
          // is the header modern browsers actually enforce, and it still blocks
          // every cross-origin framer exactly as DENY did. Only thecrwn.app can
          // frame thecrwn.app.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          // Staged rollout: the ENFORCED policy above is unchanged. This one only
          // reports. See the comment on `cspReportOnly` for what has to happen
          // before the two can be merged into a single enforced header.
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // NOTE ON HSTS: production serves `Strict-Transport-Security:
          // max-age=63072000` from the VERCEL edge, not from this file. Adding
          // our own here would emit a second, competing header, and a browser
          // that sees two STS headers processes only one of them (RFC 6797), so
          // a well-meant `includeSubDomains` could instead silently disable HSTS.
          // `includeSubDomains` belongs at the platform layer, after confirming
          // with `curl -sI https://thecrwn.app` that exactly one STS header comes
          // back. See the audit remediation notes for the DNS evidence.
        ],
      },
      {
        // Never let the HTTP cache serve a stale service worker. Always revalidate so
        // a deploy's new sw.js is fetched and installed (it's network-first + skipWaiting).
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
  images: {
    // `images.domains` is removed (deprecated) and the wildcard patterns are gone.
    // Every entry below is a host the app provably renders images from; anything
    // matching a pattern here is fetched by /_next/image and decoded by sharp, so
    // a broad pattern is an unauthenticated path to sharp's libvips decoders.
    //
    // Dropped, with reasons:
    //  - `domains: ['localhost']`  -> replaced by the dev-only pattern below.
    //  - `api.dicebear.com`        -> zero references anywhere in src/. Dead.
    //  - `*.cloudflarestorage.com` -> the R2 S3 API endpoint. Objects there need a
    //    SigV4 signature, so <Image> can never load one; the only browser traffic
    //    to that host is presigned PUT uploads and <video src>, neither of which
    //    goes through the image optimizer. This was the wildcard the audit flagged.
    //  - `*.r2.cloudflarestorage.com` -> same host, same reason.
    //  - `*.supabase.co`           -> narrowed to THIS project's host. The wildcard
    //    meant any Supabase project on the internet could feed /_next/image.
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol.replace(':', '') as 'http' | 'https',
        hostname: supabaseUrl.hostname,
        port: supabaseUrl.port || '',
        // Public buckets only (avatars, album-art, banners). Signed URLs live under
        // /storage/v1/object/sign/ and are read by <audio>/<video>, not <Image>.
        pathname: '/storage/v1/object/public/**',
      },
      // Local Supabase during development only (any port, since the local stack
      // serves storage on 54321). Never shipped to production, where this would
      // let the image optimizer fetch the deployment's own loopback.
      ...(isProd
        ? []
        : ([
            {
              protocol: 'http' as const,
              hostname: 'localhost',
              pathname: '/**',
            },
          ])),
    ],
  },
};

export default nextConfig;
