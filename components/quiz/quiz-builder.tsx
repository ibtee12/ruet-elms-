"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  QuizDetail,
  QuizQuestionInput,
  QuizOptionInput,
} from "@/services/quizzes";
import { QuestionType, QuestionDifficulty } from "@prisma/client";
import { utcToDhakaInputFormat, dhakaLocalToUtc } from "@/lib/datetime";
import { createQuizAction, updateQuizAction } from "@/actions/quizzes";
import {
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Save,
  ArrowLeft,
  Lock,
  Layers,
  CheckSquare,
  CircleDot,
  ToggleLeft,
  X,
} from "lucide-react";

interface QuizBuilderProps {
  offeringId: string;
  courseCode: string;
  initialQuiz?: QuizDetail | null;
  existingTopics?: { id: string; name: string }[];
  isArchived: boolean;
}

export function QuizBuilder({
  offeringId,
  courseCode,
  initialQuiz,
  existingTopics = [],
  isArchived,
}: QuizBuilderProps) {
  const router = useRouter();
  const isEditing = !!initialQuiz;
  const hasAttempts = !!initialQuiz?.hasAttempts;

  // 1. Quiz Settings state
  const [title, setTitle] = React.useState(initialQuiz?.title || "");
  const [description, setDescription] = React.useState(initialQuiz?.description || "");
  const [durationMin, setDurationMin] = React.useState(initialQuiz?.durationMin || 30);

  // Default dates: tomorrow 10:00 to 12:00
  const getDefaultDates = () => {
    const now = new Date();
    const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return {
      startAt: utcToDhakaInputFormat(start),
      endAt: utcToDhakaInputFormat(end),
    };
  };

  const defaultDates = getDefaultDates();
  const [startAtStr, setStartAtStr] = React.useState(
    initialQuiz ? utcToDhakaInputFormat(initialQuiz.startAt) : defaultDates.startAt
  );
  const [endAtStr, setEndAtStr] = React.useState(
    initialQuiz ? utcToDhakaInputFormat(initialQuiz.endAt) : defaultDates.endAt
  );

  const [maxAttempts, setMaxAttempts] = React.useState(initialQuiz?.maxAttempts || 1);
  const [shuffleQuestions, setShuffleQuestions] = React.useState(
    initialQuiz?.shuffleQuestions || false
  );
  const [shuffleOptions, setShuffleOptions] = React.useState(
    initialQuiz?.shuffleOptions || false
  );
  const [negativeMarkPerWrong, setNegativeMarkPerWrong] = React.useState(
    initialQuiz?.negativeMarkPerWrong || 0
  );
  const [showAnswersAfterClose, setShowAnswersAfterClose] = React.useState(
    initialQuiz?.showAnswersAfterClose || false
  );
  const [published, setPublished] = React.useState(initialQuiz?.published || false);

  // 2. Questions state
  const [questions, setQuestions] = React.useState<QuizQuestionInput[]>(() => {
    if (initialQuiz?.questions && initialQuiz.questions.length > 0) {
      return initialQuiz.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        marks: q.marks,
        topicId: q.topicId,
        difficulty: q.difficulty,
        order: q.order,
        options: q.options.map((opt) => ({
          id: opt.id,
          text: opt.text,
          isCorrect: opt.isCorrect,
          order: opt.order,
        })),
      }));
    }

    // Default first question
    return [
      {
        text: "",
        type: QuestionType.SINGLE,
        marks: 1,
        topicId: null,
        difficulty: QuestionDifficulty.MEDIUM,
        order: 0,
        options: [
          { text: "Option 1", isCorrect: true, order: 0 },
          { text: "Option 2", isCorrect: false, order: 1 },
          { text: "Option 3", isCorrect: false, order: 2 },
          { text: "Option 4", isCorrect: false, order: 3 },
        ],
      },
    ];
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Calculate total marks
  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  // Add question helper
  const handleAddQuestion = (type: QuestionType) => {
    if (hasAttempts) return;

    let options: QuizOptionInput[] = [];
    if (type === QuestionType.TRUE_FALSE) {
      options = [
        { text: "True", isCorrect: true, order: 0 },
        { text: "False", isCorrect: false, order: 1 },
      ];
    } else {
      options = [
        { text: "Option 1", isCorrect: true, order: 0 },
        { text: "Option 2", isCorrect: false, order: 1 },
        { text: "Option 3", isCorrect: false, order: 2 },
        { text: "Option 4", isCorrect: false, order: 3 },
      ];
    }

    setQuestions((prev) => [
      ...prev,
      {
        text: "",
        type,
        marks: 1,
        topicId: null,
        difficulty: QuestionDifficulty.MEDIUM,
        order: prev.length,
        options,
      },
    ]);
  };

  // Duplicate question helper
  const handleDuplicateQuestion = (index: number) => {
    if (hasAttempts) return;
    const target = questions[index];
    const cloned: QuizQuestionInput = {
      text: target.text ? `${target.text} (Copy)` : "",
      type: target.type,
      marks: target.marks,
      topicId: target.topicId,
      difficulty: target.difficulty,
      order: questions.length,
      options: target.options.map((opt, i) => ({
        text: opt.text,
        isCorrect: opt.isCorrect,
        order: i,
      })),
    };

    setQuestions((prev) => {
      const updated = [...prev];
      updated.splice(index + 1, 0, cloned);
      return updated.map((q, i) => ({ ...q, order: i }));
    });
  };

  // Reorder question helper
  const handleMoveQuestion = (index: number, direction: "up" | "down") => {
    if (hasAttempts) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy.map((q, i) => ({ ...q, order: i }));
    });
  };

  // Delete question helper
  const handleDeleteQuestion = (index: number) => {
    if (hasAttempts) return;
    if (questions.length <= 1) {
      alert("A quiz must have at least one question.");
      return;
    }
    setQuestions((prev) =>
      prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, order: i }))
    );
  };

  // Update question property
  const handleUpdateQuestion = (index: number, patch: Partial<QuizQuestionInput>) => {
    if (hasAttempts) return;
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q))
    );
  };

  // Update option helper
  const handleUpdateOption = (
    qIndex: number,
    optIndex: number,
    patch: Partial<QuizOptionInput>
  ) => {
    if (hasAttempts) return;
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;

        let updatedOptions = [...q.options];

        // If setting isCorrect on SINGLE or TRUE_FALSE, uncheck others
        if (
          patch.isCorrect &&
          (q.type === QuestionType.SINGLE || q.type === QuestionType.TRUE_FALSE)
        ) {
          updatedOptions = updatedOptions.map((opt, oi) => ({
            ...opt,
            isCorrect: oi === optIndex,
          }));
        } else {
          updatedOptions[optIndex] = { ...updatedOptions[optIndex], ...patch };
        }

        return { ...q, options: updatedOptions };
      })
    );
  };

  // Add option to question
  const handleAddOption = (qIndex: number) => {
    if (hasAttempts) return;
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        if (q.options.length >= 6) return q;
        const newOpt: QuizOptionInput = {
          text: `Option ${q.options.length + 1}`,
          isCorrect: false,
          order: q.options.length,
        };
        return { ...q, options: [...q.options, newOpt] };
      })
    );
  };

  // Remove option from question
  const handleRemoveOption = (qIndex: number, optIndex: number) => {
    if (hasAttempts) return;
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        if (q.options.length <= 2) return q;
        const filtered = q.options
          .filter((_, oi) => oi !== optIndex)
          .map((opt, oi) => ({ ...opt, order: oi }));
        return { ...q, options: filtered };
      })
    );
  };

  // Form submit handler
  const handleSubmit = async (targetPublishState?: boolean) => {
    if (isArchived) return;
    setFormError(null);

    const willPublish = targetPublishState !== undefined ? targetPublishState : published;

    // Validate settings
    if (!title.trim()) {
      setFormError("Quiz title is required.");
      return;
    }

    const startAt = dhakaLocalToUtc(startAtStr);
    const endAt = dhakaLocalToUtc(endAtStr);

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      setFormError("Start and End times must be valid dates.");
      return;
    }

    if (endAt <= startAt) {
      setFormError("Quiz end time must be strictly after the start time.");
      return;
    }

    const windowMinutes = (endAt.getTime() - startAt.getTime()) / (60 * 1000);
    if (windowMinutes < durationMin) {
      setFormError(
        `Availability window (${Math.round(windowMinutes)} min) cannot be shorter than the quiz duration (${durationMin} min).`
      );
      return;
    }

    // If publishing, check questions
    if (willPublish && questions.length === 0) {
      setFormError("Cannot publish a quiz with zero questions.");
      return;
    }

    // Validate question contents if editing allowed
    if (!hasAttempts) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.text.trim()) {
          setFormError(`Question #${i + 1}: Question text cannot be empty.`);
          return;
        }
        if (q.marks <= 0 || isNaN(q.marks)) {
          setFormError(`Question #${i + 1}: Marks must be a positive number.`);
          return;
        }
        for (let j = 0; j < q.options.length; j++) {
          if (!q.options[j].text.trim()) {
            setFormError(`Question #${i + 1}, Option #${j + 1}: Option text cannot be empty.`);
            return;
          }
        }
        const correctCount = q.options.filter((o) => o.isCorrect).length;
        if (correctCount === 0) {
          setFormError(`Question #${i + 1}: At least one option must be marked as correct.`);
          return;
        }
        if (q.type === QuestionType.SINGLE && correctCount !== 1) {
          setFormError(`Question #${i + 1} (Single Choice): Must have exactly one correct option.`);
          return;
        }
        if (q.type === QuestionType.TRUE_FALSE && correctCount !== 1) {
          setFormError(`Question #${i + 1} (True/False): Must have exactly one correct option.`);
          return;
        }
      }
    }

    setIsSaving(true);

    try {
      if (isEditing && initialQuiz) {
        await updateQuizAction(initialQuiz.id, offeringId, {
          title: title.trim(),
          description: description.trim() || null,
          durationMin,
          startAt,
          endAt,
          maxAttempts,
          shuffleQuestions,
          shuffleOptions,
          negativeMarkPerWrong: Number(negativeMarkPerWrong) || 0,
          showAnswersAfterClose,
          published: willPublish,
          questions: hasAttempts ? undefined : questions,
        });
      } else {
        await createQuizAction(offeringId, {
          title: title.trim(),
          description: description.trim() || null,
          durationMin,
          startAt,
          endAt,
          maxAttempts,
          shuffleQuestions,
          shuffleOptions,
          negativeMarkPerWrong: Number(negativeMarkPerWrong) || 0,
          showAnswersAfterClose,
          published: willPublish,
          questions,
        });
      }

      router.push(`/teach/${offeringId}/quizzes`);
      router.refresh();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setFormError(error.message || "An error occurred while saving the quiz.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/teach/${offeringId}/quizzes`}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface border border-border transition-colors"
            title="Back to Quizzes"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                {courseCode}
              </span>
              <h1 className="text-xl font-bold text-foreground">
                {isEditing ? "Edit Quiz & Question Bank" : "Create New Quiz"}
              </h1>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Configure parameters, window schedule in Asia/Dhaka, and author objective test items.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Link
            href={`/teach/${offeringId}/quizzes`}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-surface-muted transition-colors text-muted hover:text-foreground"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled={isSaving || isArchived}
            onClick={() => handleSubmit(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-muted hover:bg-surface-muted/80 text-foreground text-xs font-semibold border border-border transition-colors shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? "Saving..." : "Save Draft"}</span>
          </button>
          <button
            type="button"
            disabled={isSaving || isArchived}
            onClick={() => handleSubmit(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors shadow-xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isSaving ? "Saving..." : "Save & Publish"}</span>
          </button>
        </div>
      </div>

      {/* Attempt lock notice */}
      {hasAttempts && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold">Student Attempts Exist ({initialQuiz.attemptsCount})</h4>
            <p className="leading-relaxed">
              This quiz already has registered student attempts. To protect grading fairness and integrity, question text, choices, and answers are permanently locked. You may still adjust the quiz title, description, and time window.
            </p>
          </div>
        </div>
      )}

      {/* Form Error Banner */}
      {formError && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{formError}</span>
          </div>
          <button
            type="button"
            onClick={() => setFormError(null)}
            className="p-1 text-rose-600 dark:text-rose-400 hover:opacity-80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Section 1: Quiz Settings */}
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-5">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
          <Clock className="w-4 h-4 text-primary" />
          <span>Quiz Configuration &amp; Window Schedule</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Title */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Quiz Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Class Test 1: Data Link Layer & Framing"
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-muted/30 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Description */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Instructions / Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide test instructions, topics covered, or permitted materials..."
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-muted/30 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Duration in Minutes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Duration (Minutes) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={300}
              value={durationMin}
              onChange={(e) => setDurationMin(parseInt(e.target.value) || 1)}
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-muted/30 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <span className="text-[11px] text-muted block">
              Time allowed once a student starts an attempt.
            </span>
          </div>

          {/* Max Attempts */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Maximum Attempts Allowed
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 1)}
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-muted/30 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <span className="text-[11px] text-muted block">
              Default is 1 attempt.
            </span>
          </div>

          {/* Start Time (Asia/Dhaka) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Start Time (Asia/Dhaka) <span className="text-rose-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={startAtStr}
              onChange={(e) => setStartAtStr(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-muted/30 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <span className="text-[11px] text-muted block">
              Local time in Bangladesh (UTC+6).
            </span>
          </div>

          {/* End Time (Asia/Dhaka) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              End Time (Asia/Dhaka) <span className="text-rose-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={endAtStr}
              onChange={(e) => setEndAtStr(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-muted/30 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <span className="text-[11px] text-muted block">
              Quiz closes automatically after this time.
            </span>
          </div>

          {/* Negative Marking Penalty */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Negative Marking Penalty per Wrong Answer
            </label>
            <input
              type="number"
              step="0.05"
              min={0}
              max={10}
              value={negativeMarkPerWrong}
              onChange={(e) => setNegativeMarkPerWrong(parseFloat(e.target.value) || 0)}
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-muted/30 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <span className="text-[11px] text-muted block">
              Marks deducted for each incorrect answer (0 for none).
            </span>
          </div>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-border/60">
          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-border/80 bg-surface-muted/20 cursor-pointer hover:bg-surface-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(e) => setShuffleQuestions(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary border-border"
            />
            <div className="text-xs">
              <span className="font-semibold block text-foreground">Shuffle Questions</span>
              <span className="text-[10px] text-muted">Randomize order per student</span>
            </div>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-border/80 bg-surface-muted/20 cursor-pointer hover:bg-surface-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={shuffleOptions}
              onChange={(e) => setShuffleOptions(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary border-border"
            />
            <div className="text-xs">
              <span className="font-semibold block text-foreground">Shuffle Options</span>
              <span className="text-[10px] text-muted">Randomize choices order</span>
            </div>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-border/80 bg-surface-muted/20 cursor-pointer hover:bg-surface-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={showAnswersAfterClose}
              onChange={(e) => setShowAnswersAfterClose(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary border-border"
            />
            <div className="text-xs">
              <span className="font-semibold block text-foreground">Reveal Answers</span>
              <span className="text-[10px] text-muted">Only after quiz window closes</span>
            </div>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-border/80 bg-surface-muted/20 cursor-pointer hover:bg-surface-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary border-border"
            />
            <div className="text-xs">
              <span className="font-semibold block text-foreground">Publish Quiz</span>
              <span className="text-[10px] text-muted">Notify enrolled students</span>
            </div>
          </label>
        </div>
      </div>

      {/* Section 2: Questions Bank Builder */}
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <span>Questions Bank ({questions.length} Questions • {totalMarks} Total Marks)</span>
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Select correct choices, allocate marks per question, and organize test topics.
            </p>
          </div>

          {!hasAttempts && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleAddQuestion(QuestionType.SINGLE)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold border border-primary/20 transition-colors"
              >
                <CircleDot className="w-3.5 h-3.5" />
                <span>+ Single Choice</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion(QuestionType.MULTIPLE)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold border border-primary/20 transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>+ Multiple Choice</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion(QuestionType.TRUE_FALSE)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold border border-primary/20 transition-colors"
              >
                <ToggleLeft className="w-3.5 h-3.5" />
                <span>+ True / False</span>
              </button>
            </div>
          )}
        </div>

        {/* Questions list */}
        <div className="space-y-4">
          {questions.map((q, qIndex) => (
            <div
              key={qIndex}
              className="p-4 sm:p-5 rounded-2xl border border-border/80 bg-surface-muted/20 space-y-4 relative group"
            >
              {/* Question Header & Order Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-surface font-bold text-xs flex items-center justify-center border border-border shadow-xs text-foreground">
                    #{qIndex + 1}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                      q.type === QuestionType.SINGLE
                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
                        : q.type === QuestionType.MULTIPLE
                        ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20"
                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                    }`}
                  >
                    {q.type === QuestionType.SINGLE
                      ? "Single Choice"
                      : q.type === QuestionType.MULTIPLE
                      ? "Multiple Choice"
                      : "True / False"}
                  </span>
                </div>

                {/* Right controls */}
                {!hasAttempts && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={qIndex === 0}
                      onClick={() => handleMoveQuestion(qIndex, "up")}
                      className="p-1 rounded text-muted hover:text-foreground disabled:opacity-30"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={qIndex === questions.length - 1}
                      onClick={() => handleMoveQuestion(qIndex, "down")}
                      className="p-1 rounded text-muted hover:text-foreground disabled:opacity-30"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateQuestion(qIndex)}
                      className="p-1 rounded text-muted hover:text-foreground"
                      title="Duplicate Question"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(qIndex)}
                      className="p-1 rounded text-muted hover:text-rose-600 ml-1"
                      title="Delete Question"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Question Text */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Question Text <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  disabled={hasAttempts}
                  value={q.text}
                  onChange={(e) => handleUpdateQuestion(qIndex, { text: e.target.value })}
                  placeholder="Enter the question prompt here..."
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-80"
                />
              </div>

              {/* Meta: Marks, Difficulty, Topic */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-foreground">
                    Marks <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0.5}
                    disabled={hasAttempts}
                    value={q.marks}
                    onChange={(e) =>
                      handleUpdateQuestion(qIndex, { marks: parseFloat(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-80"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-foreground">
                    Difficulty Level
                  </label>
                  <select
                    disabled={hasAttempts}
                    value={q.difficulty || ""}
                    onChange={(e) =>
                      handleUpdateQuestion(qIndex, {
                        difficulty: (e.target.value as QuestionDifficulty) || null,
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-80"
                  >
                    <option value="">None specified</option>
                    <option value={QuestionDifficulty.EASY}>Easy</option>
                    <option value={QuestionDifficulty.MEDIUM}>Medium</option>
                    <option value={QuestionDifficulty.HARD}>Hard</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-foreground">
                    Topic Tag
                  </label>
                  <select
                    disabled={hasAttempts}
                    value={q.topicId || ""}
                    onChange={(e) =>
                      handleUpdateQuestion(qIndex, {
                        topicId: e.target.value ? e.target.value : null,
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-80"
                  >
                    <option value="">No Topic</option>
                    {existingTopics.map((top) => (
                      <option key={top.id} value={top.id}>
                        {top.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Options Section */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span>Answer Choices (Check the correct answer{q.type === QuestionType.MULTIPLE ? "s" : ""}):</span>
                  {q.type !== QuestionType.TRUE_FALSE && !hasAttempts && q.options.length < 6 && (
                    <button
                      type="button"
                      onClick={() => handleAddOption(qIndex)}
                      className="text-primary hover:underline text-xs inline-flex items-center gap-1 font-semibold"
                    >
                      <Plus className="w-3 h-3" /> Add Choice
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {q.options.map((opt, optIndex) => (
                    <div
                      key={optIndex}
                      className={`p-2.5 rounded-xl border flex items-center gap-3 transition-colors ${
                        opt.isCorrect
                          ? "bg-emerald-500/10 border-emerald-500/40"
                          : "bg-surface border-border"
                      }`}
                    >
                      {/* Selection control */}
                      {q.type === QuestionType.MULTIPLE ? (
                        <input
                          type="checkbox"
                          disabled={hasAttempts}
                          checked={opt.isCorrect}
                          onChange={(e) =>
                            handleUpdateOption(qIndex, optIndex, {
                              isCorrect: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-border shrink-0"
                          title="Mark as correct"
                        />
                      ) : (
                        <input
                          type="radio"
                          name={`correct-option-${qIndex}`}
                          disabled={hasAttempts}
                          checked={opt.isCorrect}
                          onChange={() =>
                            handleUpdateOption(qIndex, optIndex, {
                              isCorrect: true,
                            })
                          }
                          className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-border shrink-0"
                          title="Mark as correct"
                        />
                      )}

                      {/* Option text */}
                      <input
                        type="text"
                        disabled={hasAttempts || q.type === QuestionType.TRUE_FALSE}
                        value={opt.text}
                        onChange={(e) =>
                          handleUpdateOption(qIndex, optIndex, {
                            text: e.target.value,
                          })
                        }
                        placeholder={`Option ${optIndex + 1}...`}
                        className="flex-1 px-3 py-1 rounded-lg border border-border bg-surface-muted/20 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-80"
                      />

                      {/* Correct label indicator */}
                      {opt.isCorrect && (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                          Correct Answer
                        </span>
                      )}

                      {/* Remove Option Button */}
                      {!hasAttempts && q.type !== QuestionType.TRUE_FALSE && q.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(qIndex, optIndex)}
                          className="p-1 text-muted hover:text-rose-600 shrink-0"
                          title="Remove Option"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
