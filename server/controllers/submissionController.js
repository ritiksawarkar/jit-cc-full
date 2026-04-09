import { createJudge0Client } from "../judge0.js";
import mongoose from "mongoose";
import Event from "../models/Event.js";
import EventAttendance from "../models/EventAttendance.js";
import Problem from "../models/Problem.js";
import ProblemSelection from "../models/ProblemSelection.js";
import Submission from "../models/Submission.js";
import {
  notifySubmissionPassed,
  notifySubmissionFailed,
  notifySubmissionError,
} from "../services/notificationService.js";
import { isProblemExpiredByEvent } from "../services/problemExpiryService.js";

const HOST = process.env.JUDGE0_HOST;
const KEY = process.env.JUDGE0_API_KEY;
const judge0Client = createJudge0Client({ host: HOST, apiKey: KEY });

const COMPILATION_ERROR_STATUS_IDS = new Set([6]);
const RUNTIME_ERROR_STATUS_IDS = new Set([11, 12, 13]);
const TIME_LIMIT_STATUS_IDS = new Set([5]);

const LANGUAGE_NAME_TO_ID = {
  javascript: 63,
  js: 63,
  typescript: 74,
  ts: 74,
  python: 71,
  py: 71,
  java: 62,
  c: 50,
  "c++": 54,
  cpp: 54,
  csharp: 51,
  "c#": 51,
  go: 60,
  rust: 73,
};

function normalizeOutput(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

function roundTo(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function resolveLanguageId(languageId, language) {
  if (Number.isInteger(languageId)) {
    return languageId;
  }

  if (typeof language === "number") {
    return language;
  }

  if (typeof language === "string") {
    const asNumeric = Number(language);
    if (Number.isInteger(asNumeric) && asNumeric > 0) {
      return asNumeric;
    }

    const mapped = LANGUAGE_NAME_TO_ID[language.trim().toLowerCase()];
    if (mapped) {
      return mapped;
    }
  }

  return null;
}

function classifySubmissionStatus(executionResult, output, expectedOutput) {
  const statusId = Number(executionResult?.status?.id || 0);
  const statusDescription = String(
    executionResult?.status?.description || "",
  ).toLowerCase();

  if (
    COMPILATION_ERROR_STATUS_IDS.has(statusId) ||
    executionResult?.compile_output
  ) {
    return "Compilation Error";
  }

  if (
    RUNTIME_ERROR_STATUS_IDS.has(statusId) ||
    executionResult?.stderr ||
    (statusId >= 7 && statusId <= 12)
  ) {
    return "Runtime Error";
  }

  if (
    TIME_LIMIT_STATUS_IDS.has(statusId) ||
    statusDescription.includes("time limit")
  ) {
    return "Time Limit Exceeded";
  }

  return output === expectedOutput ? "Accepted" : "Wrong Answer";
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function getEventDurationMs(eventDoc) {
  const start = new Date(eventDoc?.startAt || 0).getTime();
  const end = new Date(eventDoc?.endAt || 0).getTime();
  const duration = end - start;
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

async function resolveProblem(problemId) {
  if (problemId && isValidObjectId(problemId)) {
    const byId = await Problem.findById(problemId).lean();
    if (byId) {
      return byId;
    }
  }

  return null;
}

function normalizeProblemTestCases(problem, fallbackInput = "") {
  const rawCases = Array.isArray(problem?.testCases) ? problem.testCases : [];
  if (!rawCases.length) {
    return [
      {
        index: 0,
        name: "Default Case",
        input: String(fallbackInput ?? ""),
        expectedOutput: normalizeOutput(problem?.expectedOutput || ""),
        weight: 1,
        isHidden: false,
        timeLimitSeconds: 2,
        memoryLimitKb: 131072,
      },
    ];
  }

  return rawCases
    .map((item, index) => ({
      index,
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
      name: String(item?.name || `Case ${index + 1}`),
      input: String(item?.input ?? ""),
      expectedOutput: normalizeOutput(item?.expectedOutput || ""),
      weight:
        Number.isFinite(Number(item?.weight)) && Number(item.weight) > 0
          ? Number(item.weight)
          : 1,
      isHidden: Boolean(item?.isHidden),
      timeLimitSeconds:
        Number.isFinite(Number(item?.timeLimitSeconds)) &&
        Number(item.timeLimitSeconds) > 0
          ? Number(item.timeLimitSeconds)
          : 2,
      memoryLimitKb:
        Number.isFinite(Number(item?.memoryLimitKb)) &&
        Number(item.memoryLimitKb) > 0
          ? Number(item.memoryLimitKb)
          : 131072,
    }))
    .sort((a, b) => a.order - b.order)
    .map((item, sortedIndex) => ({ ...item, index: sortedIndex }));
}

function aggregateVerdicts({ verdicts, totalPoints, passingThreshold }) {
  const safeVerdicts = Array.isArray(verdicts) ? verdicts : [];
  const totalWeight = safeVerdicts.reduce(
    (sum, verdict) => sum + Math.max(0, Number(verdict.weight || 0)),
    0,
  );
  const safeTotalWeight = totalWeight > 0 ? totalWeight : 1;

  const passedCount = safeVerdicts.filter(
    (verdict) => verdict.status === "Accepted",
  ).length;
  const earnedWeight = safeVerdicts.reduce(
    (sum, verdict) => sum + Math.max(0, Number(verdict.earnedWeight || 0)),
    0,
  );

  const percentage = roundTo((earnedWeight / safeTotalWeight) * 100, 2);
  const safeTotalPoints =
    Number.isFinite(Number(totalPoints)) && Number(totalPoints) > 0
      ? Number(totalPoints)
      : 100;
  const scoreEarned = roundTo((percentage / 100) * safeTotalPoints, 2);
  const safeThreshold = Math.min(
    100,
    Math.max(0, Number(passingThreshold ?? 100)),
  );

  const hasCompilationError = safeVerdicts.some(
    (verdict) => verdict.status === "Compilation Error",
  );
  const hasRuntimeError = safeVerdicts.some(
    (verdict) => verdict.status === "Runtime Error",
  );
  const hasTimeLimit = safeVerdicts.some(
    (verdict) => verdict.status === "Time Limit Exceeded",
  );

  let status = "Wrong Answer";
  if (hasCompilationError) {
    status = "Compilation Error";
  } else if (safeVerdicts.length && passedCount === safeVerdicts.length) {
    status = percentage >= safeThreshold ? "Accepted" : "Partial Accepted";
  } else if (hasRuntimeError && passedCount === 0) {
    status = "Runtime Error";
  } else if (hasTimeLimit && passedCount === 0) {
    status = "Time Limit Exceeded";
  } else if (passedCount > 0) {
    status = "Partial Accepted";
  }

  return {
    status,
    score: {
      total: safeTotalPoints,
      earned: scoreEarned,
      percentage,
      passedCount,
      totalCount: safeVerdicts.length,
    },
  };
}

function sanitizeVerdictsForRole(verdicts, canViewHidden) {
  return (Array.isArray(verdicts) ? verdicts : []).map((verdict) => {
    const isHidden = Boolean(verdict?.isHidden);
    if (canViewHidden || !isHidden) {
      return verdict;
    }

    return {
      ...verdict,
      input: "",
      expectedOutput: "",
    };
  });
}

function toSubmissionResponse(submissionDoc, { canViewHidden = false } = {}) {
  const base =
    typeof submissionDoc?.toObject === "function"
      ? submissionDoc.toObject()
      : { ...submissionDoc };
  const verdicts = sanitizeVerdictsForRole(base.verdicts, canViewHidden);

  if (!canViewHidden) {
    base.expectedOutput = "";
  }

  return {
    ...base,
    verdicts,
  };
}

async function evaluateSubmissionAgainstProblem({
  sourceCode,
  languageId,
  problem,
  fallbackInput,
}) {
  const cases = normalizeProblemTestCases(problem, fallbackInput);
  const verdicts = [];

  for (const testCase of cases) {
    const executionResult = await judge0Client.execute({
      language_id: languageId,
      source_code: sourceCode,
      stdin: String(testCase.input || ""),
      cpu_time_limit: Number(testCase.timeLimitSeconds || 2),
      wall_time_limit: Number(testCase.timeLimitSeconds || 2) + 1,
      memory_limit: Number(testCase.memoryLimitKb || 131072),
    });

    const actualOutput = normalizeOutput(
      executionResult?.stdout || executionResult?.stderr || "",
    );
    const expectedOutput = normalizeOutput(testCase.expectedOutput || "");
    const status = classifySubmissionStatus(
      executionResult,
      actualOutput,
      expectedOutput,
    );

    const executionTimeSeconds = Number(executionResult?.time || 0);
    const executionTime = Number.isFinite(executionTimeSeconds)
      ? executionTimeSeconds * 1000
      : Number(executionResult?.timeMs || 0);

    verdicts.push({
      index: testCase.index,
      name: testCase.name,
      isHidden: Boolean(testCase.isHidden),
      input: String(testCase.input || ""),
      expectedOutput,
      actualOutput,
      status,
      statusId: Number(executionResult?.status?.id || 0),
      executionTime,
      memory:
        executionResult?.memory !== undefined &&
        executionResult?.memory !== null
          ? Number(executionResult.memory)
          : 0,
      weight: Number(testCase.weight || 1),
      earnedWeight: status === "Accepted" ? Number(testCase.weight || 1) : 0,
      stderr: String(executionResult?.stderr || ""),
      compileOutput: String(executionResult?.compile_output || ""),
    });

    if (status === "Compilation Error") {
      break;
    }
  }

  const aggregate = aggregateVerdicts({
    verdicts,
    totalPoints: problem?.totalPoints,
    passingThreshold: problem?.passingThreshold,
  });

  const representativeVerdict =
    verdicts.find((item) => item.status !== "Accepted") || verdicts[0] || null;

  return {
    verdicts,
    status: aggregate.status,
    score: aggregate.score,
    representativeVerdict,
  };
}

export async function submitCode(req, res) {
  try {
    const {
      userId,
      problemId,
      language,
      language_id,
      sourceCode,
      input = "",
      eventId,
    } = req.body || {};
    const authenticatedUserId = req.user?.id || req.user?.sub;
    const authenticatedRole = req.user?.role;

    const targetUserId =
      authenticatedRole === "admin" && userId
        ? String(userId)
        : String(authenticatedUserId || "");

    if (
      !targetUserId ||
      sourceCode === undefined ||
      sourceCode === null ||
      (!language && !language_id)
    ) {
      return res.status(400).json({
        error: "sourceCode and either language or language_id are required",
      });
    }

    if (typeof sourceCode !== "string" || !sourceCode.trim()) {
      return res
        .status(400)
        .json({ error: "sourceCode must be a non-empty string" });
    }

    if (input !== undefined && input !== null && typeof input !== "string") {
      return res.status(400).json({ error: "input must be a string" });
    }

    const languageId = resolveLanguageId(language_id, language);
    if (!languageId) {
      return res
        .status(400)
        .json({ error: "Unsupported language or missing language_id" });
    }

    const problem = await resolveProblem(problemId);
    if (!problem) {
      return res.status(404).json({ error: "Problem not found" });
    }
    const runtimeExpired = isProblemExpiredByEvent(problem);
    if (Boolean(problem.isExpired) || runtimeExpired) {
      if (runtimeExpired && !problem.isExpired && problem._id) {
        await Problem.updateOne(
          { _id: problem._id },
          {
            $set: {
              isExpired: true,
              expiredAt: new Date(),
            },
          },
        );
      }
      return res.status(409).json({
        error: "Problem has expired. Submissions are closed.",
      });
    }

    const problemEventId = String(
      problem.eventId ||
        (Array.isArray(problem.eventIds) ? problem.eventIds[0] : ""),
    );

    if (!problemEventId) {
      return res
        .status(400)
        .json({ error: "Problem is not assigned to an event" });
    }

    let resolvedEventId = problemEventId;
    if (eventId !== undefined && eventId !== null && String(eventId).trim()) {
      if (!isValidObjectId(eventId)) {
        return res.status(400).json({ error: "Invalid eventId" });
      }

      if (String(eventId) !== problemEventId) {
        return res
          .status(400)
          .json({ error: "Submission event does not match problem event" });
      }

      const event = await Event.findById(eventId)
        .select("_id startAt endAt")
        .lean();
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (Date.now() > new Date(event.endAt || 0).getTime()) {
        return res.status(403).json({
          error: "Event has ended. Submissions are closed.",
        });
      }

      resolvedEventId = String(event._id);

      if (authenticatedRole !== "admin") {
        const attendance = await EventAttendance.findOne({
          eventId: resolvedEventId,
          userId: targetUserId,
        })
          .select("createdAt")
          .lean();

        if (!attendance) {
          return res.status(422).json({
            error: "Join this event before submitting",
          });
        }

        const durationMs = getEventDurationMs(event);
        if (durationMs <= 0) {
          return res.status(422).json({
            error: "Event duration is invalid; contact admin",
          });
        }

        const joinedAt = new Date(attendance.createdAt || 0).getTime();
        const expiresAtMs = joinedAt + durationMs;
        const nowMs = Date.now();

        if (nowMs > expiresAtMs) {
          return res.status(403).json({
            error: "Event timer expired; submissions are closed",
            expiresAt: new Date(expiresAtMs).toISOString(),
            joinedAt: new Date(joinedAt).toISOString(),
            durationSeconds: Math.floor(durationMs / 1000),
          });
        }
      }
    } else {
      const event = await Event.findById(resolvedEventId)
        .select("_id startAt endAt")
        .lean();
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (Date.now() > new Date(event.endAt || 0).getTime()) {
        return res.status(403).json({
          error: "Event has ended. Submissions are closed.",
        });
      }
    }

    const maxAttempts = Number(problem?.maxAttempts || 0);

    if (resolvedEventId && authenticatedRole !== "admin") {
      const lockedSelection = await ProblemSelection.findOne({
        eventId: resolvedEventId,
        userId: targetUserId,
        isLocked: true,
      })
        .select("problemId")
        .lean();

      if (!lockedSelection) {
        return res.status(409).json({
          error: "Problem not locked for this event; lock one first",
        });
      }

      if (String(lockedSelection.problemId) !== String(problem._id)) {
        return res.status(409).json({
          error: "Submission problem mismatch with locked selection",
          lockedProblemId: String(lockedSelection.problemId),
          submittedProblemId: String(problem._id),
        });
      }
    }

    if (maxAttempts > 0 && authenticatedRole !== "admin") {
      const existingAttempts = await Submission.countDocuments({
        userId: targetUserId,
        problemId: problem._id,
      });
      if (existingAttempts >= maxAttempts) {
        return res.status(429).json({
          error: "Submission limit reached for this problem",
          maxAttempts,
        });
      }
    }

    const evaluation = await evaluateSubmissionAgainstProblem({
      sourceCode: String(sourceCode),
      languageId,
      problem,
      fallbackInput: String(input ?? ""),
    });

    const representative = evaluation.representativeVerdict;
    const output = representative?.actualOutput || "";
    const expectedOutput = representative?.expectedOutput || "";
    const executionTime = Number(representative?.executionTime || 0);
    const memory = Number(representative?.memory || 0);

    const submission = await Submission.create({
      userId: targetUserId,
      problemId: problem._id,
      eventId: resolvedEventId,
      language: String(language || language_id),
      sourceCode: String(sourceCode),
      input: String(input ?? ""),
      output,
      expectedOutput,
      status: evaluation.status,
      executionTime,
      memory: Number.isFinite(memory) && memory > 0 ? memory : undefined,
      score: evaluation.score,
      verdicts: evaluation.verdicts,
      compileOutput: String(representative?.compileOutput || ""),
      stderrRaw: String(representative?.stderr || ""),
      judge0StatusId: Number(representative?.statusId || 0),
      evaluatedAt: new Date(),
      problemSnapshot: {
        title: String(problem?.title || ""),
        version:
          Number.isFinite(Number(problem?.version)) &&
          Number(problem.version) > 0
            ? Number(problem.version)
            : 1,
        isCompetitive: Boolean(problem?.isCompetitive ?? true),
      },
    });

    // Send notification to student based on submission result
    try {
      const score = evaluation.score?.earned || 0;
      const passedCount = evaluation.score?.passedCount || 0;
      const totalCount = evaluation.score?.totalCount || 0;

      if (evaluation.status === "Accepted") {
        // All tests passed
        await notifySubmissionPassed(targetUserId, submission, score);
      } else if (
        evaluation.status === "Compilation Error" ||
        evaluation.status === "Runtime Error"
      ) {
        // Code has errors
        const errorMsg =
          representative?.compileOutput ||
          representative?.stderr ||
          "Unknown error";
        await notifySubmissionError(targetUserId, submission, errorMsg);
      } else if (evaluation.status === "Partial Accepted" || passedCount > 0) {
        // Some tests passed
        const failedCount = totalCount - passedCount;
        await notifySubmissionFailed(targetUserId, submission, failedCount);
      } else if (
        evaluation.status === "Wrong Answer" ||
        evaluation.status === "Time Limit Exceeded"
      ) {
        // Tests failed
        await notifySubmissionFailed(targetUserId, submission, totalCount);
      }
    } catch (notifErr) {
      // Log notification error but don't fail the submission
      console.error("Error sending submission notification:", notifErr);
    }

    const canViewHidden = authenticatedRole === "admin";
    const submissionResponse = toSubmissionResponse(submission, {
      canViewHidden,
    });

    return res.status(201).json({
      message: "Submission saved",
      submission: submissionResponse,
      evaluation: {
        status: evaluation.status,
        score: evaluation.score,
        verdicts: submissionResponse.verdicts,
      },
      execution: {
        status: {
          id: representative?.statusId || 0,
          description: representative?.status || evaluation.status,
        },
        stdout: representative?.actualOutput || "",
        stderr: representative?.stderr || "",
        compile_output: representative?.compileOutput || "",
      },
    });
  } catch (err) {
    console.error("submitCode error:", err);

    const upstreamStatus = Number(err?.response?.status || 0);
    if (upstreamStatus >= 400 && upstreamStatus < 500) {
      if (upstreamStatus === 422) {
        return res.status(400).json({
          error: "Invalid submission payload",
          message: "Check language_id, sourceCode, and input values",
        });
      }
      return res.status(upstreamStatus).json({
        error: "Invalid submission request",
        message:
          err?.response?.data?.error || err?.message || "Request rejected",
      });
    }

    return res.status(500).json({
      error: "Unable to submit code",
      message: err?.message || "Unknown error",
    });
  }
}

export async function getUserSubmissions(req, res) {
  try {
    const { userId } = req.params;
    const canViewHidden =
      String(req.user?.role || "").toLowerCase() === "admin";

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const submissions = await Submission.find({ userId })
      .sort({ createdAt: -1 })
      .select(
        "userId problemId language status executionTime memory createdAt score verdicts output compileOutput stderrRaw",
      )
      .lean();

    return res.json({
      count: submissions.length,
      submissions: submissions.map((submission) =>
        toSubmissionResponse(submission, { canViewHidden }),
      ),
    });
  } catch (err) {
    console.error("getUserSubmissions error:", err);
    return res.status(500).json({ error: "Unable to fetch user submissions" });
  }
}

export async function getSubmissionByProblem(req, res) {
  try {
    const { problemId } = req.params;
    const { userId } = req.query;
    const authUserId = String(req.user?.id || req.user?.sub || "");
    const role = String(req.user?.role || "student").toLowerCase();
    const canViewHidden = role === "admin";

    if (!isValidObjectId(problemId)) {
      return res.status(400).json({ error: "Invalid problemId" });
    }

    if (userId && !isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const query = { problemId };
    if (userId) {
      if (role !== "admin" && String(userId) !== authUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      query.userId = userId;
    } else if (role !== "admin") {
      query.userId = authUserId;
    }

    const submissions = await Submission.find(query)
      .sort({ createdAt: -1 })
      .select(
        "userId problemId language status executionTime memory createdAt output expectedOutput score verdicts compileOutput stderrRaw",
      )
      .lean();

    return res.json({
      count: submissions.length,
      submissions: submissions.map((submission) =>
        toSubmissionResponse(submission, { canViewHidden }),
      ),
    });
  } catch (err) {
    console.error("getSubmissionByProblem error:", err);
    return res
      .status(500)
      .json({ error: "Unable to fetch problem submissions" });
  }
}

export async function getSubmissionById(req, res) {
  try {
    const { submissionId } = req.params;
    const authUserId = String(req.user?.id || req.user?.sub || "");
    const role = String(req.user?.role || "student").toLowerCase();
    const canViewHidden = role === "admin";

    if (!isValidObjectId(submissionId)) {
      return res.status(400).json({ error: "Invalid submissionId" });
    }

    const submission = await Submission.findById(submissionId)
      .populate("problemId", "title statement version")
      .populate("userId", "name email role")
      .lean();

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (
      role !== "admin" &&
      String(submission.userId?._id || submission.userId) !== authUserId
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json({
      submission: toSubmissionResponse(submission, { canViewHidden }),
    });
  } catch (err) {
    console.error("getSubmissionById error:", err);
    return res.status(500).json({ error: "Unable to fetch submission" });
  }
}

export async function reevaluateSubmission(req, res) {
  try {
    const { submissionId } = req.params;
    const role = String(req.user?.role || "student").toLowerCase();
    if (role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!isValidObjectId(submissionId)) {
      return res.status(400).json({ error: "Invalid submissionId" });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const languageId = resolveLanguageId(
      submission.language,
      submission.language,
    );
    if (!languageId) {
      return res.status(400).json({
        error: "Unable to resolve language for submission re-evaluation",
      });
    }

    const problem = await resolveProblem(submission.problemId);
    const evaluation = await evaluateSubmissionAgainstProblem({
      sourceCode: String(submission.sourceCode || ""),
      languageId,
      problem,
      fallbackInput: String(submission.input || ""),
    });

    const representative = evaluation.representativeVerdict;
    submission.status = evaluation.status;
    submission.score = evaluation.score;
    submission.verdicts = evaluation.verdicts;
    submission.output = representative?.actualOutput || "";
    submission.expectedOutput = representative?.expectedOutput || "";
    submission.executionTime = Number(representative?.executionTime || 0);
    submission.memory = Number(representative?.memory || 0) || undefined;
    submission.compileOutput = String(representative?.compileOutput || "");
    submission.stderrRaw = String(representative?.stderr || "");
    submission.judge0StatusId = Number(representative?.statusId || 0);
    submission.evaluatedAt = new Date();
    submission.problemSnapshot = {
      title: String(problem?.title || ""),
      version:
        Number.isFinite(Number(problem?.version)) && Number(problem.version) > 0
          ? Number(problem.version)
          : 1,
    };

    await submission.save();

    return res.json({
      message: "Submission re-evaluated",
      submission: toSubmissionResponse(submission, { canViewHidden: true }),
      evaluation: {
        status: evaluation.status,
        score: evaluation.score,
        verdicts: evaluation.verdicts,
      },
    });
  } catch (err) {
    console.error("reevaluateSubmission error:", err);
    return res.status(500).json({ error: "Unable to re-evaluate submission" });
  }
}
