import { HomeFunnel } from './HomeFunnel';

// The homepage is the artist-acquisition surface. It runs the SAME Opportunity
// Calculator funnel as /tools/opportunity-calculator (hero photo -> one CTA ->
// wizard -> result -> transition -> builder -> save/signup) by mounting the same
// production component, then renders every existing homepage marketing section
// below it. See HomeFunnel for the reuse contract.
//
// Logged-in users are redirected to /home by middleware, so this only shows to
// logged-out / prospective artists.
export default function Home() {
  return <HomeFunnel />;
}
