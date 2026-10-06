import { RiskLevel } from "@prisma/client";

export interface RiskConfig {
  lowQuizAverageThreshold: number; // default: 50
  lowQuizAveragePoints: number; // default: 30
  lateSubmissionsThreshold: number; // default: 2
  lateSubmissionsPoints: number; // default: 20
  missedAssignmentsPoints: number; // default: 20
  inactiveDaysThreshold: number; // default: 7
  inactiveDaysPoints: number; // default: 15
  lowAssignmentAverageThreshold: number; // default: 50
  lowAssignmentAveragePoints: number; // default: 15
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  lowQuizAverageThreshold: 50,
  lowQuizAveragePoints: 30,
  lateSubmissionsThreshold: 2,
  lateSubmissionsPoints: 20,
  missedAssignmentsPoints: 20,
  inactiveDaysThreshold: 7,
  inactiveDaysPoints: 15,
  lowAssignmentAverageThreshold: 50,
  lowAssignmentAveragePoints: 15,
};

/**
 * Parses RiskConfig from arbitrary Setting JSON or returns defaults.
 */
export function parseRiskConfig(raw: unknown): RiskConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_RISK_CONFIG };
  }

  const obj = raw as Record<string, unknown>;

  const getNum = (val: unknown, fallback: number): number => {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  };

  return {
    lowQuizAverageThreshold: getNum(
      obj.lowQuizAverageThreshold ?? obj.quizThreshold,
      DEFAULT_RISK_CONFIG.lowQuizAverageThreshold
    ),
    lowQuizAveragePoints: getNum(
      obj.lowQuizAveragePoints ?? obj.lowQuizScorePoints,
      DEFAULT_RISK_CONFIG.lowQuizAveragePoints
    ),
    lateSubmissionsThreshold: getNum(
      obj.lateSubmissionsThreshold,
      DEFAULT_RISK_CONFIG.lateSubmissionsThreshold
    ),
    lateSubmissionsPoints: getNum(
      obj.lateSubmissionsPoints,
      DEFAULT_RISK_CONFIG.lateSubmissionsPoints
    ),
    missedAssignmentsPoints: getNum(
      obj.missedAssignmentsPoints ?? obj.missedAssignmentPoints,
      DEFAULT_RISK_CONFIG.missedAssignmentsPoints
    ),
    inactiveDaysThreshold: getNum(
      obj.inactiveDaysThreshold,
      DEFAULT_RISK_CONFIG.inactiveDaysThreshold
    ),
    inactiveDaysPoints: getNum(
      obj.inactiveDaysPoints,
      DEFAULT_RISK_CONFIG.inactiveDaysPoints
    ),
    lowAssignmentAverageThreshold: getNum(
      obj.lowAssignmentAverageThreshold,
      DEFAULT_RISK_CONFIG.lowAssignmentAverageThreshold
    ),
    lowAssignmentAveragePoints: getNum(
      obj.lowAssignmentAveragePoints,
      DEFAULT_RISK_CONFIG.lowAssignmentAveragePoints
    ),
  };
}

export interface StudentRiskInput {
  quizAverage: number | null; // null if no quizzes exist or none attempted
  hasQuizzes: boolean;
  lateSubmissionsCount: number;
  missedPastDueCount: number;
  daysSinceLastActivity: number | null; // null if newly enrolled
  assignmentAverage: number | null; // null if no graded assignments
  hasGradedAssignments: boolean;
}

export interface RiskAssessmentResult {
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
}

/**
 * Maps numerical risk score to RiskLevel:
 * - 0 to 29: LOW
 * - 30 to 59: MEDIUM
 * - 60+: HIGH
 */
export function evaluateRiskLevel(score: number): RiskLevel {
  if (score >= 60) return RiskLevel.HIGH;
  if (score >= 30) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

/**
 * Pure function to calculate student academic risk score, level, and human-readable reasons.
 * Returns descriptive reasons with specific numbers.
 */
export function calculateRisk(
  input: StudentRiskInput,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): RiskAssessmentResult {
  let score = 0;
  const reasons: string[] = [];

  // 1. Quiz average < 50 = +30 points
  if (
    input.hasQuizzes &&
    input.quizAverage !== null &&
    input.quizAverage < config.lowQuizAverageThreshold
  ) {
    score += config.lowQuizAveragePoints;
    reasons.push(
      `Quiz average is ${input.quizAverage.toFixed(1)}% (below ${config.lowQuizAverageThreshold}%)`
    );
  }

  // 2. Two or more late submissions = +20 points
  if (input.lateSubmissionsCount >= config.lateSubmissionsThreshold) {
    score += config.lateSubmissionsPoints;
    reasons.push(
      `${input.lateSubmissionsCount} late submission${input.lateSubmissionsCount > 1 ? "s" : ""}`
    );
  }

  // 3. Any missed past-due assignments = +20 points
  if (input.missedPastDueCount > 0) {
    score += config.missedAssignmentsPoints;
    reasons.push(
      `${input.missedPastDueCount} missed past-due assignment${input.missedPastDueCount > 1 ? "s" : ""}`
    );
  }

  // 4. No activity in 7+ days = +15 points
  if (
    input.daysSinceLastActivity !== null &&
    input.daysSinceLastActivity >= config.inactiveDaysThreshold
  ) {
    score += config.inactiveDaysPoints;
    reasons.push(`no activity for ${input.daysSinceLastActivity} days`);
  }

  // 5. Assignment average < 50 = +15 points
  if (
    input.hasGradedAssignments &&
    input.assignmentAverage !== null &&
    input.assignmentAverage < config.lowAssignmentAverageThreshold
  ) {
    score += config.lowAssignmentAveragePoints;
    reasons.push(
      `Assignment average is ${input.assignmentAverage.toFixed(1)}% (below ${config.lowAssignmentAverageThreshold}%)`
    );
  }

  const riskLevel = evaluateRiskLevel(score);

  return {
    riskScore: score,
    riskLevel,
    reasons,
  };
}
