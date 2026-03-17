import { createJudge0Client } from "../judge0.js";
import mongoose from "mongoose";
import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";

const HOST = process.env.JUDGE0_HOST;
const KEY = process.env.JUDGE0_API_KEY;
const judge0Client = createJudge0Client({ host: HOST, apiKey: KEY });

const COMPILATION_ERROR_STATUS_IDS = new Set([6]);
const RUNTIME_ERROR_STATUS_IDS = new Set([11, 12, 13]);

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

function resolveLanguageId(languageId, language) {
  if (Number.isInteger(languageId)) {
    return languageId;
  }

  if (typeof language === "number") {
    return language;
  }

  if (typeof language === "string") {
    const mapped = LANGUAGE_NAME_TO_ID[language.trim().toLowerCase()];
    if (mapped) {
      return mapped;
    }
  }

  return null;
}

function classifySubmissionStatus(executionResult, output, expectedOutput) {
  const statusId = Number(executionResult?.status?.id || 0);

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

  return output === expectedOutput ? "Accepted" : "Wrong Answer";
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

async function resolveProblem(problemId) {
  if (problemId && isValidObjectId(problemId)) {
    const byId = await Problem.findById(problemId).lean();
    if (byId) {
      return byId;
    }
  }

  // Fallback problem avoids blocking submission when user has no configured problem ID.
  let fallback = await Problem.findOne({
    title: "Default Submission Problem",
  }).lean();
  if (fallback) {
    return fallback;
  }

  const created = await Problem.create({
    title: "Default Submission Problem",
    statement: "Auto-generated fallback problem for ad-hoc submissions.",
    expectedOutput: "__DEFAULT_EXPECTED_OUTPUT__",
  });

  return created.toObject();
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
    } = req.body || {};
    const authenticatedUserId = req.user?.sub;
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

    const executionResult = await judge0Client.execute({
      language_id: languageId,
      source_code: String(sourceCode),
      stdin: String(input ?? ""),
    });

    const output = normalizeOutput(
      executionResult?.stdout || executionResult?.stderr || "",
    );
    const expectedOutput = normalizeOutput(problem.expectedOutput || "");

    const status = classifySubmissionStatus(
      executionResult,
      output,
      expectedOutput,
    );

    const executionTimeSeconds = Number(executionResult?.time || 0);
    const executionTime = Number.isFinite(executionTimeSeconds)
      ? executionTimeSeconds * 1000
      : Number(executionResult?.timeMs || 0);

    const submission = await Submission.create({
      userId: targetUserId,
      problemId: problem._id,
      language: String(language || language_id),
      sourceCode: String(sourceCode),
      input: String(input ?? ""),
      output,
      expectedOutput,
      status,
      executionTime,
      memory:
        executionResult?.memory !== undefined &&
        executionResult?.memory !== null
          ? Number(executionResult.memory)
          : undefined,
    });

    return res.status(201).json({
      message: "Submission saved",
      submission,
      execution: {
        status: executionResult?.status,
        stdout: executionResult?.stdout || "",
        stderr: executionResult?.stderr || "",
        compile_output: executionResult?.compile_output || "",
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

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const submissions = await Submission.find({ userId })
      .sort({ createdAt: -1 })
      .select("userId problemId language status executionTime memory createdAt")
      .lean();

    return res.json({ count: submissions.length, submissions });
  } catch (err) {
    console.error("getUserSubmissions error:", err);
    return res.status(500).json({ error: "Unable to fetch user submissions" });
  }
}

export async function getSubmissionByProblem(req, res) {
  try {
    const { problemId } = req.params;
    const { userId } = req.query;

    if (!isValidObjectId(problemId)) {
      return res.status(400).json({ error: "Invalid problemId" });
    }

    if (userId && !isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const query = { problemId };
    if (userId) {
      query.userId = userId;
    }

    const submissions = await Submission.find(query)
      .sort({ createdAt: -1 })
      .select(
        "userId problemId language status executionTime memory createdAt output expectedOutput",
      )
      .lean();

    return res.json({ count: submissions.length, submissions });
  } catch (err) {
    console.error("getSubmissionByProblem error:", err);
    return res
      .status(500)
      .json({ error: "Unable to fetch problem submissions" });
  }
}
