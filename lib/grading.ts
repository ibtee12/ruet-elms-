/**
 * Calculates displayed final marks after applying late submission penalty rules.
 * Pure function:
 * - If not late or penaltyPercent <= 0: returns raw marks.
 * - If late: applies penalty deduction based on assignment's maximum marks.
 * - Result is floored at 0 (never negative).
 * - Result is rounded to 2 decimal places.
 * - Raw marks are never overwritten.
 *
 * @param raw - The raw marks awarded by the teacher (e.g. 85)
 * @param max - The assignment's maximum possible marks (e.g. 100)
 * @param isLate - Whether this submission version was turned in late
 * @param penaltyPercent - The assignment's configured late penalty percentage (0-100)
 * @returns The final marks after late penalty deduction
 */
export function calcFinalMarks(
  raw: number,
  max: number,
  isLate: boolean,
  penaltyPercent: number
): number {
  const rawNum = Number(raw) || 0;
  const maxNum = Number(max) || 0;
  const penaltyNum = Number(penaltyPercent) || 0;

  if (!isLate || penaltyNum <= 0) {
    return Math.round(rawNum * 100) / 100;
  }

  const deduction = (maxNum * penaltyNum) / 100;
  const finalScore = Math.max(0, rawNum - deduction);

  return Math.round(finalScore * 100) / 100;
}
