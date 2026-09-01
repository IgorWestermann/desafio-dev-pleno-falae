export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export class MockState {
  private sequence = 0;
  private readonly rateBuckets = new Map<string, RateBucket>();

  nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  shouldFail(sequence: number, failEveryN: number): boolean {
    return failEveryN > 0 && sequence % failEveryN === 0;
  }

  consumeRateLimit(
    key: string,
    now: number,
    limit: number,
    windowMs: number,
  ): RateLimitResult {
    const existing = this.rateBuckets.get(key);
    let bucket: RateBucket;

    if (existing === undefined || now >= existing.resetAt) {
      bucket = {
        count: 0,
        resetAt: now + windowMs,
      };
      this.rateBuckets.set(key, bucket);
    } else {
      bucket = existing;
    }

    bucket.count += 1;

    return {
      allowed: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  reset(): void {
    this.sequence = 0;
    this.rateBuckets.clear();
  }
}
