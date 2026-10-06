"use client";

import * as React from "react";
import Link from "next/link";
import { StudentQuizListItem, StudentQuizCategory } from "@/services/quiz-attempts";
import { formatDhaka } from "@/lib/datetime";
import {
  HelpCircle,
  Clock,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Search,
  Lock,
  Play,
  Award,
} from "lucide-react";

interface StudentQuizListProps {
  offeringId: string;
  courseCode: string;
  quizzes: {
    open: StudentQuizListItem[];
    upcoming: StudentQuizListItem[];
    attempted: StudentQuizListItem[];
    closed: StudentQuizListItem[];
    all: StudentQuizListItem[];
  };
}

export function StudentQuizList({
  offeringId,
  courseCode,
  quizzes,
}: StudentQuizListProps) {
  const [selectedTab, setSelectedTab] = React.useState<"ALL" | StudentQuizCategory>("OPEN");
  const [searchTerm, setSearchTerm] = React.useState("");

  const getTabList = () => {
    switch (selectedTab) {
      case "OPEN":
        return quizzes.open;
      case "UPCOMING":
        return quizzes.upcoming;
      case "ATTEMPTED":
        return quizzes.attempted;
      case "CLOSED":
        return quizzes.closed;
      case "ALL":
      default:
        return quizzes.all;
    }
  };

  const currentList = getTabList().filter((q) =>
    q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (q.description && q.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusBadge = (category: StudentQuizCategory, hasInProgress: boolean) => {
    if (hasInProgress) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping mr-0.5" />
          In Progress
        </span>
      );
    }
    switch (category) {
      case "OPEN":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-0.5" />
            Open Now
          </span>
        );
      case "UPCOMING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
            <Clock className="w-3 h-3" /> Upcoming
          </span>
        );
      case "ATTEMPTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
            <CheckCircle2 className="w-3 h-3" /> Attempted
          </span>
        );
      case "CLOSED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border">
            <Lock className="w-3 h-3" /> Closed
          </span>
        );
    }
  };

  const tabs: Array<{ id: "ALL" | StudentQuizCategory; label: string }> = [
    { id: "OPEN", label: `Open (${quizzes.open.length})` },
    { id: "UPCOMING", label: `Upcoming (${quizzes.upcoming.length})` },
    { id: "ATTEMPTED", label: `Attempted (${quizzes.attempted.length})` },
    { id: "CLOSED", label: `Closed (${quizzes.closed.length})` },
    { id: "ALL", label: `All (${quizzes.all.length})` },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
            {courseCode}
          </span>
        </div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-primary" />
          <span>Course Quizzes &amp; Objective Tests</span>
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Take timed assessments, review completed test attempts, and view automated evaluation results.
        </p>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-surface p-3 rounded-xl border border-border">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted hover:text-foreground hover:bg-surface-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search quizzes..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-surface-muted/40 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Quizzes List */}
      {currentList.length === 0 ? (
        <div className="py-12 text-center rounded-2xl border border-dashed border-border bg-surface/50 p-8">
          <HelpCircle className="w-12 h-12 text-muted mx-auto mb-3" />
          <h3 className="text-base font-bold text-foreground mb-1">
            No Quizzes in this Category
          </h3>
          <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed">
            {selectedTab === "OPEN"
              ? "There are currently no active quizzes open for taking."
              : selectedTab === "UPCOMING"
              ? "No scheduled upcoming quizzes announced yet."
              : selectedTab === "ATTEMPTED"
              ? "You haven't submitted any quiz attempts yet."
              : "No quizzes available under this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map((quiz) => (
            <div
              key={quiz.id}
              className="p-5 rounded-2xl border border-border bg-surface shadow-xs hover:border-primary/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(quiz.category, quiz.hasInProgressAttempt)}
                  <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                    {quiz.durationMin} mins
                  </span>
                  <span className="text-xs font-medium text-muted">
                    {quiz.questionsCount} {quiz.questionsCount === 1 ? "question" : "questions"} ({quiz.totalMarks} marks)
                  </span>
                  {quiz.negativeMarkPerWrong > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                      -{quiz.negativeMarkPerWrong} penalty / wrong
                    </span>
                  )}
                  {quiz.bestScore !== null && (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" /> Best: {quiz.bestScore} / {quiz.totalMarks}
                    </span>
                  )}
                </div>

                <div>
                  <Link
                    href={`/courses/${offeringId}/quizzes/${quiz.id}`}
                    className="text-base font-bold text-foreground hover:text-primary transition-colors line-clamp-1"
                  >
                    {quiz.title}
                  </Link>
                  {quiz.description && (
                    <p className="text-xs text-muted line-clamp-1 mt-0.5">
                      {quiz.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted pt-1">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted" />
                    <span>
                      Window: {formatDhaka(quiz.startAt, "short")} – {formatDhaka(quiz.endAt, "short")}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted">
                    Attempts: {quiz.attemptsUsed} / {quiz.maxAttempts} used
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="shrink-0 flex items-center gap-2">
                <Link
                  href={`/courses/${offeringId}/quizzes/${quiz.id}`}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors shadow-xs ${
                    quiz.hasInProgressAttempt
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : quiz.category === "OPEN"
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                      : "bg-surface-muted hover:bg-surface-muted/80 text-foreground border border-border"
                  }`}
                >
                  {quiz.hasInProgressAttempt ? (
                    <>
                      <Play className="w-3.5 h-3.5" /> Resume Quiz
                    </>
                  ) : quiz.category === "OPEN" ? (
                    <>
                      <Play className="w-3.5 h-3.5" /> Take Quiz
                    </>
                  ) : (
                    <>
                      View Details <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
