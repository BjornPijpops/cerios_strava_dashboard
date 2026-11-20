/**
 * Tracks Strava's rate limits using the response headers:
 *   X-RateLimit-Limit: "100,1000"   (15-minute, daily)
 *   X-RateLimit-Usage: "12,340"
 * and refuses to send requests once the remaining budget drops below `reserve`.
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface RateLimitState {
  limit15: number;
  limitDay: number;
  usage15: number;
  usageDay: number;
}

export class RateLimitGuard {
  private state: RateLimitState = { limit15: 100, limitDay: 1000, usage15: 0, usageDay: 0 };
  private windowStart = Date.now();
  private static readonly WINDOW_MS = 15 * 60 * 1000;

  /** @param reserve requests kept free for other callers/manual use */
  constructor(private readonly reserve = 5) {}

  /** Throws RateLimitError if sending another request would eat into the reserve. */
  assertCanRequest(): void {
    this.rollWindow();
    const { limit15, limitDay, usage15, usageDay } = this.state;
    if (usage15 >= limit15 - this.reserve) {
      throw new RateLimitError(`15-minute budget exhausted (${usage15}/${limit15}). Retry later.`);
    }
    if (usageDay >= limitDay - this.reserve) {
      throw new RateLimitError(`Daily budget exhausted (${usageDay}/${limitDay}). Retry tomorrow.`);
    }
  }

  /** Count a request locally, then correct with the server's numbers when headers are present. */
  record(headers: Headers): void {
    this.rollWindow();
    this.state.usage15++;
    this.state.usageDay++;
    const limit = parsePair(headers.get('x-ratelimit-limit'));
    const usage = parsePair(headers.get('x-ratelimit-usage'));
    if (limit) [this.state.limit15, this.state.limitDay] = limit;
    if (usage) [this.state.usage15, this.state.usageDay] = usage;
  }

  snapshot(): RateLimitState {
    return { ...this.state };
  }

  private rollWindow(): void {
    if (Date.now() - this.windowStart >= RateLimitGuard.WINDOW_MS) {
      this.windowStart = Date.now();
      this.state.usage15 = 0;
    }
  }
}

function parsePair(value: string | null): [number, number] | undefined {
  if (!value) return undefined;
  const [a, b] = value.split(',').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : undefined;
}
