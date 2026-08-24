// Pure, deterministic helpers for the Phase 0 Instagram carousel publish proof.
//
// PHASE 0 SCOPE. This file is deliberately disposable. It holds only the logic that can be
// decided without touching the network, so that the parts which would silently ruin a real
// post (slide ORDER above all) are testable. Everything with a side effect lives in
// scripts/test-instagram-carousel-publish.mjs.
//
// Why this is a .mjs under scripts/ but its test is a .ts under src/: `npm test` is
// vitest with include ['src/**/*.test.ts'] (vitest.config.ts), so a test outside src/ would
// never run. Rather than duplicate the ordering logic into the script (which is exactly the
// drift that would let a tested function and a shipped function disagree), the module stays
// here next to its only consumer and src/lib/social/instagramCarousel.test.ts imports it.
// One implementation, covered by the real runner.

import path from 'node:path';

// ---------------------------------------------------------------------------
// Instagram publishing limits, from the official Meta reference:
// developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/
// Verified 2026-08-24. Aspect ratio OUTSIDE the range is REJECTED (the request fails); it is
// not silently cropped. Width above the max IS silently scaled down.
// ---------------------------------------------------------------------------
export const IG_LIMITS = {
  minAspectRatio: 0.8, // 4:5
  maxAspectRatio: 1.91, // 1.91:1
  minWidth: 320,
  maxWidth: 1440,
  maxFileBytes: 8 * 1024 * 1024, // 8 MB
  maxCarouselItems: 10,
  minCarouselItems: 2,
  maxCaptionChars: 2200,
  format: 'JPEG',
};

// The canonical Instagram portrait frame. 1080x1350 is exactly 4:5, the TALLEST frame
// Instagram accepts, which wastes the least of a 3:4 source sheet.
export const TARGET_FRAME = { width: 1080, height: 1350 };

/**
 * Order the slide files in a generated carousel folder.
 *
 * This is the single most dangerous function in the proof: publishing the right images in the
 * wrong order produces a real, public, wrong post. It is strict on purpose. It refuses
 * anything ambiguous rather than guessing, because a guess here is invisible until a human
 * looks at a live post.
 *
 * Accepts `slide-<n>.jpg`. Sorts NUMERICALLY (so slide-10 follows slide-9, which a plain
 * lexicographic sort gets wrong). Requires the numbers to start at 1 and be contiguous with
 * no duplicates.
 *
 * @param {string[]} files bare filenames, in any order
 * @returns {{ ok: boolean, slides: string[], errors: string[] }}
 */
export function discoverSlides(files) {
  const errors = [];
  const seen = new Map();

  for (const f of files) {
    const m = /^slide-(\d+)\.jpe?g$/i.exec(f);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1) {
      errors.push(`Slide number is not a positive integer: ${f}`);
      continue;
    }
    if (seen.has(n)) {
      errors.push(`Two files claim slide ${n}: ${seen.get(n)} and ${f}`);
      continue;
    }
    seen.set(n, f);
  }

  if (seen.size === 0) {
    return { ok: false, slides: [], errors: ['No slide-<n>.jpg files found in the folder.'] };
  }

  const numbers = [...seen.keys()].sort((a, b) => a - b);

  if (numbers[0] !== 1) {
    errors.push(`Slides must start at slide-1. Lowest found is slide-${numbers[0]}.`);
  }
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] !== numbers[i - 1] + 1) {
      errors.push(`Gap in slide numbering: slide-${numbers[i - 1]} is followed by slide-${numbers[i]}.`);
    }
  }

  const slides = numbers.map((n) => seen.get(n));
  return { ok: errors.length === 0, slides, errors };
}

/**
 * The caption is the whole of caption.md, verbatim. The generator writes exactly the caption
 * and nothing else into that file, so there is no front matter to strip and no heading to
 * skip. Trailing whitespace is trimmed because the generator appends a newline.
 *
 * @param {string} raw contents of caption.md
 * @returns {{ ok: boolean, caption: string, errors: string[], warnings: string[] }}
 */
export function parseCaption(raw) {
  const errors = [];
  const warnings = [];
  const caption = String(raw ?? '').trim();

  if (!caption) errors.push('caption.md is empty.');
  if (caption.length > IG_LIMITS.maxCaptionChars) {
    errors.push(
      `Caption is ${caption.length} characters, over the Instagram limit of ${IG_LIMITS.maxCaptionChars}.`
    );
  }
  // Not fatal, but the CTA keyword is the entire point of the post reaching ManyChat.
  if (!/comment\s+["“']?[A-Z]{3,}/i.test(caption)) {
    warnings.push('No obvious "Comment KEYWORD" call to action found in the caption.');
  }
  return { ok: errors.length === 0, caption, errors, warnings };
}

/**
 * Decide what has to happen to one source image before Instagram will accept it.
 *
 * CRWN's generated sheets are 3584x4800 (aspect 0.747), which is OUTSIDE Instagram's
 * 4:5..1.91:1 range, so posting them raw fails at container creation. They are pure white
 * paper with wide margins, so the correct fix is to CONTAIN them in a 4:5 white frame
 * (pad the narrow axis) rather than crop, which would clip the hand-lettering.
 *
 * @param {{width:number,height:number,bytes?:number}} src
 * @returns {{
 *   needsTransform: boolean,
 *   reasons: string[],
 *   plan: {
 *     sourceWidth: number, sourceHeight: number, sourceAspect: number,
 *     targetWidth: number, targetHeight: number, targetAspect: number,
 *     innerWidth: number, innerHeight: number,
 *     padLeftRight: number, padTopBottom: number,
 *     background: string
 *   }
 * }}
 */
export function planImageTransform(src) {
  const { width, height } = src;
  const ar = width / height;
  const reasons = [];

  if (ar < IG_LIMITS.minAspectRatio) {
    reasons.push(
      `aspect ${ar.toFixed(4)} is below Instagram's minimum ${IG_LIMITS.minAspectRatio} (4:5), which is rejected, so it is padded on the left and right`
    );
  } else if (ar > IG_LIMITS.maxAspectRatio) {
    reasons.push(
      `aspect ${ar.toFixed(4)} is above Instagram's maximum ${IG_LIMITS.maxAspectRatio} (1.91:1), which is rejected, so it is padded on the top and bottom`
    );
  }
  if (width > IG_LIMITS.maxWidth) {
    reasons.push(`width ${width}px is above Instagram's maximum ${IG_LIMITS.maxWidth}px`);
  }
  if (src.bytes != null && src.bytes > IG_LIMITS.maxFileBytes) {
    reasons.push(`file is ${(src.bytes / 1048576).toFixed(2)}MB, above the 8MB limit`);
  }

  // "contain" into the target frame: scale to fit, then pad the short axis with white.
  const scale = Math.min(TARGET_FRAME.width / width, TARGET_FRAME.height / height);
  const innerW = Math.round(width * scale);
  const innerH = Math.round(height * scale);
  const padX = Math.round((TARGET_FRAME.width - innerW) / 2);
  const padY = Math.round((TARGET_FRAME.height - innerH) / 2);

  return {
    needsTransform: reasons.length > 0,
    reasons,
    plan: {
      sourceWidth: width,
      sourceHeight: height,
      sourceAspect: Number(ar.toFixed(4)),
      targetWidth: TARGET_FRAME.width,
      targetHeight: TARGET_FRAME.height,
      targetAspect: Number((TARGET_FRAME.width / TARGET_FRAME.height).toFixed(4)),
      innerWidth: innerW,
      innerHeight: innerH,
      padLeftRight: padX,
      padTopBottom: padY,
      background: '#FFFFFF',
    },
  };
}

/**
 * Validate a carousel folder before any network call is made.
 * Everything here is cheap and local, so there is no reason to discover it after a container
 * has already been created on Meta's side.
 */
export function validateFolder({ folder, files, captionRaw, images }) {
  const errors = [];
  const warnings = [];

  const slideResult = discoverSlides(files);
  errors.push(...slideResult.errors);

  if (!files.includes('caption.md')) {
    errors.push('caption.md is missing from the folder.');
  }

  const captionResult = parseCaption(captionRaw ?? '');
  errors.push(...captionResult.errors);
  warnings.push(...captionResult.warnings);

  const count = slideResult.slides.length;
  if (count && count < IG_LIMITS.minCarouselItems) {
    errors.push(`A carousel needs at least ${IG_LIMITS.minCarouselItems} images; found ${count}.`);
  }
  if (count > IG_LIMITS.maxCarouselItems) {
    errors.push(`A carousel allows at most ${IG_LIMITS.maxCarouselItems} images; found ${count}.`);
  }

  const transforms = (images ?? []).map((img) => ({
    file: img.file,
    ...planImageTransform(img),
  }));

  return {
    ok: errors.length === 0,
    folder,
    slug: folder ? path.basename(folder) : null,
    slides: slideResult.slides,
    caption: captionResult.caption,
    transforms,
    errors,
    warnings,
  };
}

/**
 * Classify a Graph API failure so the operator is told whether to retry or to fix something.
 *
 * A wrong call here is expensive in both directions: retrying a permanent failure burns the
 * 100-posts-per-24h budget, and giving up on a transient one loses a post. When in doubt this
 * returns permanent, because a human looking at a failed post is safer than a loop hammering
 * Meta.
 */
export function classifyGraphError(status, body) {
  const err = body?.error ?? {};
  const code = err.code;
  const sub = err.error_subcode;
  const message = err.message || `HTTP ${status}`;

  // Rate limiting, on either the HTTP layer or Meta's application layer.
  if (status === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
    return { retryable: true, kind: 'rate_limit', message, code, sub };
  }
  if (status >= 500) {
    return { retryable: true, kind: 'server', message, code, sub };
  }
  // Auth problems are permanent until a human issues a new token.
  if (status === 401 || code === 190 || code === 102 || code === 10 || code === 200) {
    return { retryable: false, kind: 'auth', message, code, sub };
  }
  // Meta could not fetch or could not process the media we pointed it at.
  if (code === 9004 || code === 2207003 || code === 2207032 || code === 2207052) {
    return { retryable: false, kind: 'media_fetch', message, code, sub };
  }
  if (code === 36003 || code === 2207009 || code === 2207010 || code === 2207023) {
    return { retryable: false, kind: 'media_format', message, code, sub };
  }
  return { retryable: false, kind: 'permanent', message, code, sub };
}

/**
 * Strip secrets out of anything about to be printed or thrown.
 * The access token rides in query strings and request bodies, so a naive console.log of a URL
 * or an error would put it in the terminal scrollback and any CI log.
 */
export function redact(text, secrets = []) {
  let out = typeof text === 'string' ? text : JSON.stringify(text);
  if (out == null) return out;
  for (const s of secrets) {
    if (s && String(s).length >= 8) {
      out = out.split(String(s)).join('[REDACTED]');
    }
  }
  // Belt and braces: any access_token= in a URL, even one we did not pass in.
  out = out.replace(/(access_token=)[^&\s"']+/gi, '$1[REDACTED]');
  return out;
}

/**
 * Container status from GET /{container-id}?fields=status_code.
 * FINISHED is the only state that may be published.
 */
export function interpretContainerStatus(statusCode) {
  switch (statusCode) {
    case 'FINISHED':
      return { done: true, ok: true, message: 'ready to publish' };
    case 'IN_PROGRESS':
      return { done: false, ok: true, message: 'still processing' };
    case 'ERROR':
      return { done: true, ok: false, message: 'Meta failed to process the media' };
    case 'EXPIRED':
      return { done: true, ok: false, message: 'container expired before it was published (24h limit)' };
    case 'PUBLISHED':
      return { done: true, ok: false, message: 'container was already published' };
    default:
      return { done: false, ok: true, message: `unrecognized status ${statusCode}` };
  }
}
