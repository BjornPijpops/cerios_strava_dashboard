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
  private windowStart: number;
  private static readonly WINDOW_MS = 15 * 60 * 1000;

  /**
   * @param now clock in epoch ms, injected so the 15-minute window is testable
   * @param reserve requests kept free for other callers/manual use
   */
  constructor(private readonly now: () => number, private readonly reserve = 5) {
    this.windowStart = now();
  }

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
    if (this.now() - this.windowStart >= RateLimitGuard.WINDOW_MS) {
      this.windowStart = this.now();
      this.state.usage15 = 0;
    }
  }
}

/**
 * Strava applies limits per API application, and every member has their own app, so each client id
 * gets its own guard: one member's usage never blocks another member.
 */
export class RateLimitRegistry {
  private readonly guards = new Map<string, RateLimitGuard>();

  constructor(private readonly now: () => number, private readonly reserve = 5) {}

  forApp(clientId: string): RateLimitGuard {
    let guard = this.guards.get(clientId);
    if (!guard) this.guards.set(clientId, (guard = new RateLimitGuard(this.now, this.reserve)));
    return guard;
  }

  /** The most used app, which is what matters when judging whether a sync is close to a limit. */
  busiest(): RateLimitState {
    const all = [...this.guards.values()].map((g) => g.snapshot());
    return all.sort((a, b) => b.usage15 / b.limit15 - a.usage15 / a.limit15)[0] ?? new RateLimitGuard(this.now, this.reserve).snapshot();
  }
}

function parsePair(value: string | null): [number, number] | undefined {
  if (!value) return undefined;
  const [a, b] = value.split(',').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : undefined;
}
