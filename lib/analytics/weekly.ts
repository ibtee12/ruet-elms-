/**
 * Pure weekly activity aggregation and trend calculations.
 */

export interface WeeklyBucketConfig {
  weekIndex: number; // 0 is most recent (last 7 days), 7 is 8 weeks ago
  weekNumber: number; // 1 to 8 (1 = most recent, 8 = oldest)
  startDate: Date;
  endDate: Date;
}

export interface WeeklyActivityBucket extends WeeklyBucketConfig {
  count: number;
  changeFromOlderWeek: number | null; // count - count_of_previous_chronological_week
}

export interface WeeklyActivitySummary {
  weeks: WeeklyActivityBucket[]; // Index 0 is most recent week, index 7 is oldest
  currentWeekCount: number;
  previousWeekCount: number;
  weekOverWeekChange: number; // currentWeekCount - previousWeekCount
  weekOverWeekChangePercent: number | null; // percentage change or null if previous is 0
  totalEvents8Weeks: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Generates 8 weekly interval boundaries leading up to `now`.
 * Week 0: [now - 7d, now]
 * Week 1: [now - 14d, now - 7d]
 * ...
 * Week 7: [now - 56d, now - 49d]
 */
export function getWeeklyIntervals(now: Date = new Date()): WeeklyBucketConfig[] {
  const buckets: WeeklyBucketConfig[] = [];
  const nowMs = now.getTime();

  for (let i = 0; i < 8; i++) {
    const endDate = new Date(nowMs - i * WEEK_MS);
    const startDate = new Date(nowMs - (i + 1) * WEEK_MS);

    buckets.push({
      weekIndex: i,
      weekNumber: i + 1,
      startDate,
      endDate,
    });
  }

  return buckets;
}

/**
 * Pure function to calculate weekly activity summary and week-over-week trends
 * given counts for the 8 weekly buckets (from most recent week [0] to oldest [7]).
 */
export function calculateWeeklyActivity(
  weeklyCounts: number[],
  intervals?: WeeklyBucketConfig[]
): WeeklyActivitySummary {
  // Ensure array has 8 entries, pad with 0 if necessary
  const counts = Array.from({ length: 8 }, (_, i) => weeklyCounts[i] ?? 0);
  const configs = intervals && intervals.length === 8 ? intervals : getWeeklyIntervals();

  const weeks: WeeklyActivityBucket[] = configs.map((cfg, idx) => {
    const currentCount = counts[idx];
    const olderWeekCount = idx < 7 ? counts[idx + 1] : null;
    const changeFromOlderWeek =
      olderWeekCount !== null ? currentCount - olderWeekCount : null;

    return {
      ...cfg,
      count: currentCount,
      changeFromOlderWeek,
    };
  });

  const currentWeekCount = counts[0] ?? 0;
  const previousWeekCount = counts[1] ?? 0;
  const weekOverWeekChange = currentWeekCount - previousWeekCount;

  let weekOverWeekChangePercent: number | null = null;
  if (previousWeekCount > 0) {
    const pct = ((currentWeekCount - previousWeekCount) / previousWeekCount) * 100;
    weekOverWeekChangePercent = Math.round(pct * 100) / 100;
  }

  const totalEvents8Weeks = counts.reduce((sum, c) => sum + c, 0);

  return {
    weeks,
    currentWeekCount,
    previousWeekCount,
    weekOverWeekChange,
    weekOverWeekChangePercent,
    totalEvents8Weeks,
  };
}
