import { prisma } from "@/lib/prisma";

// In-memory sliding window cache: key = `${userId}:${materialId}` -> lastViewed timestamp (ms)
const viewThrottleCache = new Map<string, number>();

// Clean up entries older than 2 hours periodically to avoid memory growth
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
let lastCleanup = Date.now();

function purgeOldThrottleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  for (const [key, timestamp] of viewThrottleCache.entries()) {
    if (timestamp < twoHoursAgo) {
      viewThrottleCache.delete(key);
    }
  }
}

export interface RecordMaterialViewParams {
  userId: string;
  offeringId: string;
  materialId: string;
}

/**
 * Records an ActivityEvent of type "MATERIAL_VIEWED" for a user viewing/opening/downloading a course material.
 * Throttled to at most once per material per hour per user.
 * Returns true if an event was logged, false if throttled.
 */
export async function recordMaterialView({
  userId,
  offeringId,
  materialId,
}: RecordMaterialViewParams): Promise<boolean> {
  purgeOldThrottleEntries();

  const throttleKey = `${userId}:${materialId}`;
  const now = Date.now();
  const lastViewed = viewThrottleCache.get(throttleKey);

  if (lastViewed && now - lastViewed < 60 * 60 * 1000) {
    return false; // Throttled within 1 hour
  }

  viewThrottleCache.set(throttleKey, now);

  await prisma.activityEvent.create({
    data: {
      userId,
      offeringId,
      type: "MATERIAL_VIEWED",
    },
  });

  return true;
}

/**
 * Clears the view throttle cache (primarily for test suite isolation).
 */
export function clearMaterialViewThrottle() {
  viewThrottleCache.clear();
}
