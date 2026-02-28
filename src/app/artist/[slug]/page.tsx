export default function ArtistPage({ params }: { params: { slug: string } }) {
  return (
    <div className="min-h-screen bg-crwn-bg p-4">
      <h1 className="text-3xl font-bold text-crwn-gold mb-4">Artist: {params.slug}</h1>
      <p className="text-crwn-text-secondary">Public artist page placeholder</p>
    </div>
  );
}
