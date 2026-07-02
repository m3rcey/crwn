import { WorthExperience } from './(public)/worth/WorthExperience';

// The homepage is the artist-acquisition surface: the "money left on the table"
// calculator with the CRWN nav + signup CTAs. Logged-in users are redirected to
// /home by middleware, so this only shows to logged-out / prospective artists.
export default function Home() {
  return <WorthExperience homepage />;
}
