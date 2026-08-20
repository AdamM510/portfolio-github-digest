/** Shared, dependency-free helpers used by both the fetch layer and the report layer. */

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export function daysAgo(iso: string, now: Date = new Date()): number {
  const then = new Date(iso).getTime();
  return Math.floor((now.getTime() - then) / (1000 * 60 * 60 * 24));
}

/**
 * Runs `fn` over `items` with at most `limit` in flight at once.
 * Used to keep concurrent npm registry lookups polite rather than firing
 * dozens of requests simultaneously.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index] as T;
      results[index] = await fn(item, index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
