export default function ArtistPageLoading() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      {/* Banner skeleton */}
      <div className="relative h-48 sm:h-64 bg-crwn-elevated animate-pulse" />
      {/* Avatar + name skeleton */}
      <div className="px-4 -mt-16 relative z-10">
        <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-crwn-surface border-4 border-crwn-bg animate-pulse" />
        <div className="mt-4 space-y-2">
          <div className="h-6 w-48 bg-crwn-elevated rounded animate-pulse" />
          <div className="h-4 w-32 bg-crwn-elevated rounded animate-pulse" />
        </div>
      </div>
      {/* Tab skeleton */}
      <div className="px-4 mt-6 flex gap-4">
        <div className="h-8 w-16 bg-crwn-elevated rounded animate-pulse" />
        <div className="h-8 w-16 bg-crwn-elevated rounded animate-pulse" />
        <div className="h-8 w-16 bg-crwn-elevated rounded animate-pulse" />
        <div className="h-8 w-16 bg-crwn-elevated rounded animate-pulse" />
      </div>
      {/* Content skeleton */}
      <div className="px-4 mt-6 space-y-3">
        <div className="h-16 bg-crwn-elevated rounded-lg animate-pulse" />
        <div className="h-16 bg-crwn-elevated rounded-lg animate-pulse" />
        <div className="h-16 bg-crwn-elevated rounded-lg animate-pulse" />
      </div>
    </div>
  );
}
