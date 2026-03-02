import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-crwn-bg flex flex-col">
      {/* Header */}
      <header className="p-6 border-b border-crwn-elevated">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-crwn-gold">CRWN</Link>
          <div className="flex gap-4">
            <Link href="/login" className="px-4 py-2 text-crwn-text hover:text-crwn-gold transition-colors">
              Sign In
            </Link>
            <Link href="/signup" className="px-4 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-crwn-text mb-6">
          The All-In-One Platform for Music Artists
        </h1>
        <p className="text-xl text-crwn-text-secondary max-w-2xl mx-auto mb-8">
          Build, grow, and monetize your music career with powerful tools designed for independent artists.
        </p>
      </section>

      {/* Features */}
      <section className="py-16 px-4 bg-crwn-surface">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Monetization */}
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="text-5xl">💰</div>
            <div>
              <h2 className="text-2xl font-bold text-crwn-gold mb-2">Monetize Your Music</h2>
              <p className="text-crwn-text-secondary">
                Create subscription tiers for your biggest fans. Offer exclusive content, early access to new releases, and special perks. Set your own prices and keep more of what you earn.
              </p>
            </div>
          </div>

          {/* Subscriptions */}
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="text-5xl">⭐</div>
            <div>
              <h2 className="text-2xl font-bold text-crwn-gold mb-2">Subscription Tiers</h2>
              <p className="text-crwn-text-secondary">
                Let fans support you monthly with flexible tiers. From free followers to premium superfans - everyone can participate in your journey.
              </p>
            </div>
          </div>

          {/* Community */}
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="text-5xl">👥</div>
            <div>
              <h2 className="text-2xl font-bold text-crwn-gold mb-2">Build Your Community</h2>
              <p className="text-crwn-text-secondary">
                Connect directly with your fans through posts, comments, and exclusive updates. Build a loyal following that grows with you.
              </p>
            </div>
          </div>

          {/* Streaming */}
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="text-5xl">🎵</div>
            <div>
              <h2 className="text-2xl font-bold text-crwn-gold mb-2">Stream & Sell Music</h2>
              <p className="text-crwn-text-secondary">
                Upload your tracks, set access levels, and control who can listen. Sell individual tracks or offer full access to subscribers.
              </p>
            </div>
          </div>

          {/* Analytics */}
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="text-5xl">📊</div>
            <div>
              <h2 className="text-2xl font-bold text-crwn-gold mb-2">Own Your Data</h2>
              <p className="text-crwn-text-secondary">
                Full analytics on your subscribers, plays, and revenue. You own your data and can export it anytime. No middleman taking your information.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 text-center">
        <h2 className="text-3xl font-bold text-crwn-text mb-6">Ready to Start?</h2>
        <p className="text-crwn-text-secondary mb-8 max-w-lg mx-auto">
          Join thousands of artists building their careers on CRWN. Free to sign up, no hidden fees.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/signup" className="px-8 py-3 bg-crwn-gold text-crwn-bg font-semibold rounded-lg hover:bg-crwn-gold-hover transition-colors">
            Create Free Account
          </Link>
          <Link href="/login" className="px-8 py-3 border border-crwn-gold text-crwn-gold font-semibold rounded-lg hover:bg-crwn-gold/10 transition-colors">
            Sign In
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-crwn-elevated mt-auto">
        <div className="max-w-4xl mx-auto text-center text-crwn-text-secondary text-sm">
          <p>© 2024 CRWN. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
