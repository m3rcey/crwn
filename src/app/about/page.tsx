import { redirect } from 'next/navigation';

/**
 * Z12 dilution audit: `/about` was a pre-positioning marketing page and it contradicted the
 * ratified category.
 *
 * Its headline called CRWN a platform that does everything, over a six-emoji feature list, which is
 * exactly the feature-bundle positioning `docs/POSITIONING.md` forbids: no feature is ever the
 * headline, and CRWN is a Fan Economy Operating System rather than a bundle of tools. It also
 * carried beginner framing ("Build, grow, and monetize your music career") aimed at nobody in the
 * beachhead.
 *
 * It was reachable at a public URL and linked from NOWHERE in the app, so it could only ever be
 * found by search, which is the worst case: a stale category claim with no surrounding context.
 *
 * REDIRECTED rather than deleted, on purpose. The homepage is the canonical positioning surface
 * (rewritten in Z2 from the ratified strategy), so the URL keeps working and sends anyone who has
 * it to the correct expression instead of 404ing an indexed page. If `/about` is ever wanted back
 * as a real page, it inherits from POSITIONING.md like every other surface.
 */
export default function AboutPage() {
  redirect('/');
}
