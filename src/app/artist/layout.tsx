import ArtistPageWithNav from '@/components/artist/ArtistPageWithNav';

export default function ArtistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ArtistPageWithNav>{children}</ArtistPageWithNav>;
}
