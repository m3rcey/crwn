export default function AlbumPageLoading() {
  return (
    <div className="min-h-screen bg-crwn-bg page-fade-in">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Album cover skeleton */}
        <div className="w-48 h-48 sm:w-64 sm:h-64 mx-auto rounded-xl bg-crwn-elevated animate-pulse" />
        {/* Title + artist skeleton */}
        <div className="mt-6 text-center space-y-2">
          <div className="h-6 w-40 mx-auto bg-crwn-elevated rounded animate-pulse" />
          <div className="h-4 w-24 mx-auto bg-crwn-elevated rounded animate-pulse" />
        </div>
        {/* Track list skeleton */}
        <div className="mt-8 space-y-3">
          <div className="h-14 bg-crwn-elevated rounded-lg animate-pulse" />
          <div className="h-14 bg-crwn-elevated rounded-lg animate-pulse" />
          <div className="h-14 bg-crwn-elevated rounded-lg animate-pulse" />
          <div className="h-14 bg-crwn-elevated rounded-lg animate-pulse" />
          <div className="h-14 bg-crwn-elevated rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
