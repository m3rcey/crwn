export function SkeletonTrack() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg">
      <div className="w-12 h-12 rounded-lg bg-crwn-elevated animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-crwn-elevated rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-crwn-elevated rounded w-1/2 animate-pulse" />
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden">
      <div className="aspect-square bg-crwn-elevated animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-crwn-elevated rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-crwn-elevated rounded w-1/2 animate-pulse" />
      </div>
    </div>
  );
}

export function SkeletonTierCard() {
  return (
    <div className="neu-raised p-6 rounded-xl">
      <div className="h-6 bg-crwn-elevated rounded w-1/2 mb-4 animate-pulse" />
      <div className="h-8 bg-crwn-elevated rounded w-1/3 mb-4 animate-pulse" />
      <div className="space-y-2">
        <div className="h-3 bg-crwn-elevated rounded w-full animate-pulse" />
        <div className="h-3 bg-crwn-elevated rounded w-5/6 animate-pulse" />
        <div className="h-3 bg-crwn-elevated rounded w-4/6 animate-pulse" />
      </div>
    </div>
  );
}

export function SkeletonPost() {
  return (
    <div className="neu-raised p-4 rounded-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-crwn-elevated animate-pulse" />
        <div className="space-y-2">
          <div className="h-4 bg-crwn-elevated rounded w-24 animate-pulse" />
          <div className="h-3 bg-crwn-elevated rounded w-16 animate-pulse" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-crwn-elevated rounded w-full animate-pulse" />
        <div className="h-3 bg-crwn-elevated rounded w-5/6 animate-pulse" />
      </div>
    </div>
  );
}

export function SkeletonTrackList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonTrack key={i} />
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
