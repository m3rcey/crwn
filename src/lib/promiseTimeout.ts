// Bounds any awaited promise so a hung network request can't freeze a submit
// button forever — it rejects after `ms`, letting the caller reset state and
// show a retry-able error instead of spinning indefinitely.
export function withTimeout<T>(p: PromiseLike<T>, ms = 60000): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('That took too long — check your connection and try again.')), ms)
    ),
  ]);
}
