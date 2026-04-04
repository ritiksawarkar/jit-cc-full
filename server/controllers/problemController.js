import mongoose from "mongoose";
import Event from "../models/Event.js";
import Problem from "../models/Problem.js";

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function normalizeOutput(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

function normalizeTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function sanitizeTestCases(testCases = [], canViewHidden) {
  return testCases
    .map((item, index) => ({
      index,
      name: String(item?.name || "").trim() || `Case ${index + 1}`,
      input: String(item?.input ?? ""),
      expectedOutput: normalizeOutput(item?.expectedOutput || ""),
      weight:
        Number.isFinite(Number(item?.weight)) && Number(item.weight) > 0
          ? Number(item.weight)
          : 1,
      isHidden: Boolean(item?.isHidden),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
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
    .map((item, sortedIndex) => ({
      ...item,
      index: sortedIndex,
      input: canViewHidden || !item.isHidden ? item.input : "",
      expectedOutput:
        canViewHidden || !item.isHidden ? item.expectedOutput : "",
    }));
}

function serializeProblem(problemDoc, { canViewHidden = false } = {}) {
  const item =
    typeof problemDoc?.toObject === "function"
      ? problemDoc.toObject()
      : { ...problemDoc };

  const eventDoc =
    item.eventId && typeof item.eventId === "object" ? item.eventId : null;
  const fallbackEventId =
    Array.isArray(item.eventIds) && item.eventIds.length > 0
      ? item.eventIds[0]
      : "";
  const eventId = eventDoc?._id
    ? String(eventDoc._id)
    : String(item.eventId || fallbackEventId || "");

  return {
    id: String(item._id),
    title: item.title,
    statement: item.statement || "",
    expectedOutput: canViewHidden ? item.expectedOutput || "" : "",
    sampleInput: item.sampleInput || "",
    sampleOutput: item.sampleOutput || "",
    difficulty: item.difficulty || "medium",
    tags: Array.isArray(item.tags) ? item.tags : [],
    eventId,
    event: eventDoc
      ? {
          id: String(eventDoc._id),
          title: eventDoc.title || "",
          description: eventDoc.description || "",
          startAt: eventDoc.startAt || null,
          endAt: eventDoc.endAt || null,
          createdAt: eventDoc.createdAt || null,
          updatedAt: eventDoc.updatedAt || null,
        }
      : null,
    isCompetitive: Boolean(item.isCompetitive ?? true),
    createdBy: item.createdBy ? String(item.createdBy) : null,
    totalPoints:
      Number.isFinite(Number(item.totalPoints)) && Number(item.totalPoints) > 0
        ? Number(item.totalPoints)
        : 100,
    passingThreshold: Math.min(
      100,
      Math.max(0, Number(item.passingThreshold ?? 100)),
    ),
    maxAttempts:
      Number.isFinite(Number(item.maxAttempts)) && Number(item.maxAttempts) > 0
        ? Number(item.maxAttempts)
        : null,
    isActive: Boolean(item.isActive),
    version:
      Number.isFinite(Number(item.version)) && Number(item.version) > 0
        ? Number(item.version)
        : 1,
    testCases: sanitizeTestCases(item.testCases || [], canViewHidden),
    testCaseCount: Array.isArray(item.testCases) ? item.testCases.length : 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function parseProblemPayload(body = {}) {
  const title = String(body.title || "").trim();
  const statement = String(body.statement || "");
  const expectedOutput = normalizeOutput(body.expectedOutput || "");
  const eventId = String(body.eventId || "").trim();

  if (!title) {
    return { error: "title is required" };
  }
  if (!eventId) {
    return { error: "Please select an event" };
  }

  const rawCases = Array.isArray(body.testCases) ? body.testCases : [];
  const testCases = rawCases.map((item, index) => {
    const expected = normalizeOutput(item?.expectedOutput || "");
    if (!expected) {
      return { error: `testCases[${index}].expectedOutput is required` };
    }

    return {
      name: String(item?.name || "")
        .trim()
        .slice(0, 120),
      input: String(item?.input ?? ""),
      expectedOutput: expected,
      weight:
        Number.isFinite(Number(item?.weight)) && Number(item.weight) > 0
          ? Number(item.weight)
          : 1,
      isHidden: item?.isHidden !== undefined ? Boolean(item.isHidden) : true,
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
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
    };
  });

  const parseError = testCases.find((item) => item?.error)?.error;
  if (parseError) {
    return { error: parseError };
  }

  const difficulty = ["easy", "medium", "hard"].includes(
    String(body.difficulty || "").toLowerCase(),
  )
    ? String(body.difficulty).toLowerCase()
    : "medium";

  const totalPoints =
    Number.isFinite(Number(body.totalPoints)) && Number(body.totalPoints) > 0
      ? Number(body.totalPoints)
      : 100;

  const passingThreshold = Math.min(
    100,
    Math.max(0, Number(body.passingThreshold ?? 100)),
  );

  const maxAttempts =
    body.maxAttempts === null || body.maxAttempts === undefined
      ? null
      : Number.isFinite(Number(body.maxAttempts)) &&
          Number(body.maxAttempts) > 0
        ? Number(body.maxAttempts)
        : null;

  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];

  return {
    value: {
      title: title.slice(0, 200),
      statement,
      expectedOutput,
      sampleInput: String(body.sampleInput || ""),
      sampleOutput: String(body.sampleOutput || ""),
      difficulty,
      tags,
      eventId,
      isCompetitive:
        body.isCompetitive === undefined ? true : Boolean(body.isCompetitive),
      testCases,
      totalPoints,
      passingThreshold,
      maxAttempts,
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      version:
        Number.isFinite(Number(body.version)) && Number(body.version) > 0
          ? Number(body.version)
          : 1,
    },
  };
}

export async function listProblems(req, res) {
  try {
    const role = String(req.user?.role || "student").toLowerCase();
    const canViewHidden = role === "admin";
    const eventIdFilter = String(req.query.eventId || "").trim();

    if (eventIdFilter && !isValidObjectId(eventIdFilter)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const onlyActive =
      req.query.includeInactive === "true" && canViewHidden
        ? {}
        : { isActive: true };

    const query = eventIdFilter
      ? {
          ...onlyActive,
          $or: [{ eventId: eventIdFilter }, { eventIds: eventIdFilter }],
        }
      : onlyActive;

    // Server-side pagination support
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [problems, total] = await Promise.all([
      Problem.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("eventId", "title description startAt endAt createdBy")
        .lean(),
      Problem.countDocuments(query),
    ]);

    return res.json({
      count: problems.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      problems: problems.map((problem) =>
        serializeProblem(problem, { canViewHidden }),
      ),
    });
  } catch (err) {
    console.error("listProblems error:", err);
    return res.status(500).json({ error: "Unable to fetch problems" });
  }
}

export async function listProblemsForEvent(req, res) {
  try {
    req.query = {
      ...(req.query || {}),
      eventId: req.params?.eventId,
    };
    return await listProblems(req, res);
  } catch (err) {
    console.error("listProblemsForEvent error:", err);
    return res.status(500).json({ error: "Unable to fetch event problems" });
  }
}

export async function getProblemById(req, res) {
  try {
    const { problemId } = req.params;
    const role = String(req.user?.role || "student").toLowerCase();
    const canViewHidden = role === "admin";

    if (!isValidObjectId(problemId)) {
      return res.status(400).json({ error: "Invalid problemId" });
    }

    const problem = await Problem.findById(problemId)
      .populate("eventId", "title description startAt endAt createdBy")
      .lean();
    if (!problem) {
      return res.status(404).json({ error: "Problem not found" });
    }

    if (!problem.isActive && !canViewHidden) {
      return res.status(404).json({ error: "Problem not found" });
    }

    return res.json({
      problem: serializeProblem(problem, { canViewHidden }),
    });
  } catch (err) {
    console.error("getProblemById error:", err);
    return res.status(500).json({ error: "Unable to fetch problem" });
  }
}

export async function createProblem(req, res) {
  try {
    const parsed = parseProblemPayload(req.body || {});
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    if (!isValidObjectId(parsed.value.eventId)) {
      return res.status(400).json({ error: "Invalid event selected" });
    }

    const event = await Event.findById(parsed.value.eventId)
      .select("_id title")
      .lean();
    if (!event) {
      return res.status(400).json({ error: "Invalid event selected" });
    }

    const duplicate = await Problem.findOne({
      eventId: event._id,
      title: new RegExp(
        `^${normalizeTitle(parsed.value.title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i",
      ),
    })
      .select("_id title")
      .lean();

    if (duplicate) {
      return res.status(409).json({
        error: "Problem already exists for this event",
      });
    }

    const created = await Problem.create({
      ...parsed.value,
      eventId: event._id,
      createdBy: req.user?.id || req.user?.sub || null,
    });

    return res.status(201).json({
      message: "Problem created",
      problem: serializeProblem(
        await Problem.findById(created._id)
          .populate("eventId", "title description startAt endAt createdBy")
          .lean(),
        { canViewHidden: true },
      ),
    });
  } catch (err) {
    console.error("createProblem error:", err);
    return res.status(500).json({ error: "Unable to create problem" });
  }
}

export async function updateProblem(req, res) {
  try {
    const { problemId } = req.params;
    if (!isValidObjectId(problemId)) {
      return res.status(400).json({ error: "Invalid problemId" });
    }

    const parsed = parseProblemPayload(req.body || {});
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    if (!isValidObjectId(parsed.value.eventId)) {
      return res.status(400).json({ error: "Invalid event selected" });
    }

    const event = await Event.findById(parsed.value.eventId)
      .select("_id title")
      .lean();
    if (!event) {
      return res.status(400).json({ error: "Invalid event selected" });
    }

    const duplicate = await Problem.findOne({
      eventId: event._id,
      _id: { $ne: problemId },
      title: new RegExp(
        `^${normalizeTitle(parsed.value.title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i",
      ),
    })
      .select("_id title")
      .lean();

    if (duplicate) {
      return res.status(409).json({
        error: "Problem already exists for this event",
      });
    }

    const nextVersion =
      Number.isFinite(Number(req.body?.version)) && Number(req.body.version) > 0
        ? Number(req.body.version)
        : undefined;

    const update = {
      ...parsed.value,
      eventId: event._id,
      version: nextVersion,
    };

    if (!update.version) {
      // Increment version automatically if caller does not explicitly set it.
      const current = await Problem.findById(problemId)
        .select("version")
        .lean();
      if (!current) {
        return res.status(404).json({ error: "Problem not found" });
      }
      update.version = Number(current.version || 1) + 1;
    }

    const updated = await Problem.findByIdAndUpdate(problemId, update, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ error: "Problem not found" });
    }

    return res.json({
      message: "Problem updated",
      problem: serializeProblem(
        await Problem.findById(updated._id)
          .populate("eventId", "title description startAt endAt createdBy")
          .lean(),
        { canViewHidden: true },
      ),
    });
  } catch (err) {
    console.error("updateProblem error:", err);
    return res.status(500).json({ error: "Unable to update problem" });
  }
}

export async function archiveProblem(req, res) {
  try {
    const { problemId } = req.params;
    if (!isValidObjectId(problemId)) {
      return res.status(400).json({ error: "Invalid problemId" });
    }

    const updated = await Problem.findByIdAndUpdate(
      problemId,
      { isActive: false },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ error: "Problem not found" });
    }

    return res.json({
      message: "Problem archived",
      problem: serializeProblem(updated, { canViewHidden: true }),
    });
  } catch (err) {
    console.error("archiveProblem error:", err);
    return res.status(500).json({ error: "Unable to archive problem" });
  }
}

/**
 * Bulk import problems from CSV or JSON
 * CSV: title, statement, difficulty, totalPoints, passingThreshold, tags, testCases (JSON string)
 * JSON: array of problem objects
 */
export async function bulkImportProblems(req, res) {
  try {
    const { problems: problemsToImport = [], conflictMode = "skip" } = req.body;

    if (!Array.isArray(problemsToImport) || problemsToImport.length === 0) {
      return res.status(400).json({
        error: "Problems array is required and must not be empty",
      });
    }

    if (!["skip", "replace", "error"].includes(conflictMode)) {
      return res.status(400).json({
        error: "conflictMode must be 'skip', 'replace', or 'error'",
      });
    }

    const results = {
      imported: [],
      failed: [],
      skipped: [],
      total: problemsToImport.length,
    };

    for (let i = 0; i < problemsToImport.length; i++) {
      try {
        const payload = problemsToImport[i];
        const validationErrors = [];

        // Parse & validate each row
        const title = String(payload.title || "").trim();
        if (!title) {
          validationErrors.push("title is required");
        }

        const statement = String(payload.statement || "");
        const difficulty = String(payload.difficulty || "medium").toLowerCase();
        if (!["easy", "medium", "hard"].includes(difficulty)) {
          validationErrors.push(
            `difficulty must be one of: easy, medium, hard (got ${difficulty})`,
          );
        }

        const totalPoints = Number(payload.totalPoints) || 100;
        if (totalPoints <= 0) {
          validationErrors.push("totalPoints must be > 0");
        }

        const passingThreshold = Math.min(
          100,
          Math.max(0, Number(payload.passingThreshold) || 100),
        );

        const testCases = Array.isArray(payload.testCases)
          ? payload.testCases
          : [];
        if (testCases.length === 0) {
          validationErrors.push("testCases array is required and non-empty");
        }

        // Validate each test case
        for (const [tcIdx, tc] of testCases.entries()) {
          const expectedOutput = normalizeOutput(tc?.expectedOutput || "");
          if (!expectedOutput) {
            validationErrors.push(
              `testCases[${tcIdx}].expectedOutput is required`,
            );
          }
        }

        if (validationErrors.length > 0) {
          results.failed.push({
            index: i,
            title: title || `Row ${i + 1}`,
            errors: validationErrors,
          });
          continue;
        }

        // Check for existing problem with same title
        const existing = await Problem.findOne({ title });

        if (existing) {
          if (conflictMode === "error") {
            results.failed.push({
              index: i,
              title,
              errors: [
                `Problem with title "${title}" already exists (conflictMode: error)`,
              ],
            });
            continue;
          } else if (conflictMode === "skip") {
            results.skipped.push({
              index: i,
              title,
              reason: `Problem with title "${title}" already exists (conflictMode: skip)`,
            });
            continue;
          } else if (conflictMode === "replace") {
            // Update existing problem
            const updated = await Problem.findByIdAndUpdate(
              existing._id,
              {
                statement,
                difficulty,
                totalPoints,
                passingThreshold,
                tags: Array.isArray(payload.tags) ? payload.tags : [],
                testCases: testCases.map((item, index) => ({
                  name: String(item?.name || "")
                    .trim()
                    .slice(0, 120),
                  input: String(item?.input ?? ""),
                  expectedOutput: normalizeOutput(item?.expectedOutput || ""),
                  weight:
                    Number.isFinite(Number(item?.weight)) &&
                    Number(item.weight) > 0
                      ? Number(item.weight)
                      : 1,
                  isHidden:
                    item?.isHidden !== undefined
                      ? Boolean(item.isHidden)
                      : true,
                  order: Number.isFinite(Number(item?.order))
                    ? Number(item.order)
                    : index,
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
                })),
                $inc: { version: 1 },
              },
              { new: true },
            );

            results.imported.push({
              index: i,
              title,
              id: String(updated._id),
              action: "replaced",
            });
            continue;
          }
        }

        // Create new problem
        const newProblem = await Problem.create({
          title,
          statement,
          expectedOutput: "",
          sampleInput: "",
          sampleOutput: "",
          difficulty,
          tags: Array.isArray(payload.tags) ? payload.tags : [],
          isCompetitive:
            payload.isCompetitive !== undefined
              ? Boolean(payload.isCompetitive)
              : true,
          totalPoints,
          passingThreshold,
          maxAttempts: payload.maxAttempts || null,
          isActive: true,
          version: 1,
          testCases: testCases.map((item, index) => ({
            name: String(item?.name || "")
              .trim()
              .slice(0, 120),
            input: String(item?.input ?? ""),
            expectedOutput: normalizeOutput(item?.expectedOutput || ""),
            weight:
              Number.isFinite(Number(item?.weight)) && Number(item.weight) > 0
                ? Number(item.weight)
                : 1,
            isHidden:
              item?.isHidden !== undefined ? Boolean(item.isHidden) : true,
            order: Number.isFinite(Number(item?.order))
              ? Number(item.order)
              : index,
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
          })),
        });

        results.imported.push({
          index: i,
          title,
          id: String(newProblem._id),
          action: "created",
        });
      } catch (itemErr) {
        console.error(`Error processing problem at index ${i}:`, itemErr);
        results.failed.push({
          index: i,
          title: String(problemsToImport[i]?.title || `Row ${i + 1}`),
          errors: [itemErr.message || "Unknown error"],
        });
      }
    }

    return res.json({
      message: "Bulk import completed",
      ...results,
    });
  } catch (err) {
    console.error("bulkImportProblems error:", err);
    return res.status(500).json({
      error: "Unable to process bulk import",
      details: err.message,
    });
  }
}
