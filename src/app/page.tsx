export default function Home() {
  return (
    <main className="min-h-screen bg-crwn-bg flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-crwn-gold mb-4">CRWN</h1>
        <p className="text-crwn-text-secondary text-xl mb-8">
          The all-in-one platform for music artists
        </p>
        <div className="flex gap-4 justify-center">
          <button className="px-6 py-3 bg-crwn-gold text-crwn-bg font-semibold rounded-lg hover:bg-crwn-gold-hover transition-colors">
            Get Started
          </button>
          <button className="px-6 py-3 border border-crwn-gold text-crwn-gold font-semibold rounded-lg hover:bg-crwn-gold/10 transition-colors">
            Learn More
          </button>
        </div>
      </div>
      
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
        <div className="bg-crwn-surface p-6 rounded-xl border border-crwn-elevated">
          <div className="text-3xl mb-3">🎵</div>
          <h3 className="text-lg font-semibold text-crwn-gold mb-2">Monetize</h3>
          <p className="text-crwn-text-secondary text-sm">Subscription tiers, exclusive content, and direct fan support.</p>
        </div>
        <div className="bg-crwn-surface p-6 rounded-xl border border-crwn-elevated">
          <div className="text-3xl mb-3">👥</div>
          <h3 className="text-lg font-semibold text-crwn-gold mb-2">Connect</h3>
          <p className="text-crwn-text-secondary text-sm">Build community with fans through posts, comments, and live events.</p>
        </div>
        <div className="bg-crwn-surface p-6 rounded-xl border border-crwn-elevated">
          <div className="text-3xl mb-3">📊</div>
          <h3 className="text-lg font-semibold text-crwn-gold mb-2">Own Your Data</h3>
          <p className="text-crwn-text-secondary text-sm">Full analytics and ownership of your subscriber relationships.</p>
        </div>
      </div>
    </main>
  );
}
