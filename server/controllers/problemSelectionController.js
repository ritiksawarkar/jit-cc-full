import mongoose from "mongoose";
import AdminAuditLog from "../models/AdminAuditLog.js";
import Event from "../models/Event.js";
import EventAttendance from "../models/EventAttendance.js";
import Problem from "../models/Problem.js";
import ProblemSelection from "../models/ProblemSelection.js";
import Submission from "../models/Submission.js";

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function getUnlockGraceMinutes() {
  const raw = Number(process.env.EVENT_SELECTION_UNLOCK_GRACE_MINUTES || 20);
  if (!Number.isFinite(raw)) {
    return 20;
  }
  return Math.min(120, Math.max(0, Math.floor(raw)));
}

function toMs(minutes) {
  return Number(minutes || 0) * 60 * 1000;
}

function getEventDurationMs(eventDoc) {
  const start = new Date(eventDoc?.startAt || 0).getTime();
  const end = new Date(eventDoc?.endAt || 0).getTime();
  const duration = end - start;
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function canStudentUnlockForEvent(eventDoc) {
  const now = Date.now();
  const startAt = new Date(eventDoc.startAt).getTime();
  const unlockCutoff = startAt + toMs(getUnlockGraceMinutes());
  return now <= unlockCutoff;
}

function mapSelection(selectionDoc) {
  const item =
    typeof selectionDoc?.toObject === "function"
      ? selectionDoc.toObject()
      : { ...selectionDoc };

  return {
    id: String(item._id),
    eventId: String(item.eventId),
    userId: String(item.userId),
    problemId: String(item.problemId),
    isLocked: Boolean(item.isLocked),
    lockedAt: item.lockedAt,
    unlockedAt: item.unlockedAt,
    reason: item.reason || "",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function logAdminSelectionAction(req, action, targetId, metadata = {}) {
  const adminId = req.user?.id || req.user?.sub;
  if (!adminId) {
    return;
  }

  try {
    await AdminAuditLog.create({
      adminId,
      action: String(action || "").slice(0, 120),
      targetType: "problem_selection",
      targetId: String(targetId || "").slice(0, 120),
      metadata,
    });
  } catch (err) {
    console.error("logAdminSelectionAction error:", err);
  }
}

export async function getMyProblemSelection(req, res) {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id || req.user?.sub;

    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const selection = await ProblemSelection.findOne({
      eventId,
      userId,
      isLocked: true,
    }).lean();

    if (!selection) {
      return res.status(404).json({
        selection: null,
        message: "No problem locked for this event",
      });
    }

    const problem = await Problem.findById(selection.problemId)
      .select("title statement sampleInput sampleOutput difficulty totalPoints")
      .lean();

    return res.json({
      selection: mapSelection(selection),
      problem: problem
        ? {
            id: String(problem._id),
            title: problem.title,
            statement: problem.statement || "",
            sampleInput: problem.sampleInput || "",
            sampleOutput: problem.sampleOutput || "",
            difficulty: problem.difficulty || "medium",
            totalPoints:
              Number.isFinite(Number(problem.totalPoints)) &&
              Number(problem.totalPoints) > 0
                ? Number(problem.totalPoints)
                : 100,
          }
        : null,
    });
  } catch (err) {
    console.error("getMyProblemSelection error:", err);
    return res.status(500).json({ error: "Unable to fetch problem selection" });
  }
}

export async function getMyJoinedEvents(req, res) {
  try {
    const userId = req.user?.id || req.user?.sub;

    const attendanceRows = await EventAttendance.find({ userId })
      .populate("eventId", "title description startAt endAt")
      .sort({ createdAt: -1 })
      .lean();

    const eventIds = attendanceRows
      .map((row) => String(row?.eventId?._id || ""))
      .filter(Boolean);

    let selectionMap = new Map();
    if (eventIds.length > 0) {
      const lockedSelections = await ProblemSelection.find({
        userId,
        eventId: { $in: eventIds },
        isLocked: true,
      })
        .select("eventId problemId lockedAt")
        .lean();

      selectionMap = new Map(
        lockedSelections.map((item) => [String(item.eventId), item]),
      );
    }

    const nowMs = Date.now();
    const events = attendanceRows
      .filter((row) => row?.eventId?._id)
      .map((row) => {
        const event = row.eventId;
        const eventId = String(event._id);
        const startAtMs = new Date(event.startAt || 0).getTime();
        const endAtMs = new Date(event.endAt || 0).getTime();
        const active = nowMs >= startAtMs && nowMs <= endAtMs;
        const ended = nowMs > endAtMs;
        const selection = selectionMap.get(eventId);

        return {
          id: eventId,
          title: String(event.title || "Untitled Event"),
          description: String(event.description || ""),
          startAt: event.startAt,
          endAt: event.endAt,
          joinedAt: row.createdAt,
          attendanceStatus: String(row.status || "registered"),
          active,
          ended,
          lockedProblemId: selection?.problemId
            ? String(selection.problemId)
            : "",
          lockedAt: selection?.lockedAt || null,
        };
      });

    return res.json({ count: events.length, events });
  } catch (err) {
    console.error("getMyJoinedEvents error:", err);
    return res.status(500).json({ error: "Unable to fetch your events" });
  }
}

export async function joinEventWithCode(req, res) {
  try {
    const userId = req.user?.id || req.user?.sub;
    const rawCode = String(req.body?.eventCode || "").trim();

    if (!rawCode) {
      return res.status(400).json({ error: "eventCode is required" });
    }

    if (!isValidObjectId(rawCode)) {
      return res.status(400).json({ error: "Invalid event code" });
    }

    const event = await Event.findById(rawCode)
      .select("_id title description startAt endAt")
      .lean();

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (new Date(event.endAt).getTime() < Date.now()) {
      return res.status(422).json({ error: "Event has already ended" });
    }

    const existing = await EventAttendance.findOne({
      eventId: event._id,
      userId,
    })
      .select("_id status createdAt")
      .lean();

    const durationMs = getEventDurationMs(event);
    if (durationMs <= 0) {
      return res.status(422).json({
        error: "Event duration is invalid; contact admin",
      });
    }

    let attendanceCreatedAt = existing?.createdAt || null;
    if (!existing) {
      const createdAttendance = await EventAttendance.create({
        eventId: event._id,
        userId,
        status: "registered",
      });
      attendanceCreatedAt = createdAttendance?.createdAt || new Date();
    }

    const joinedAtDate = new Date(attendanceCreatedAt || new Date());
    const expiresAtDate = new Date(joinedAtDate.getTime() + durationMs);
    const nowMs = Date.now();
    const remainingSeconds = Math.max(
      0,
      Math.floor((expiresAtDate.getTime() - nowMs) / 1000),
    );

    return res.json({
      message: existing
        ? "Already joined this event"
        : "Joined event successfully",
      alreadyJoined: Boolean(existing),
      event: {
        id: String(event._id),
        title: event.title,
        description: event.description || "",
        startAt: event.startAt,
        endAt: event.endAt,
      },
      session: {
        eventId: String(event._id),
        joinedAt: joinedAtDate.toISOString(),
        expiresAt: expiresAtDate.toISOString(),
        durationSeconds: Math.floor(durationMs / 1000),
        remainingSeconds,
        serverNow: new Date(nowMs).toISOString(),
      },
    });
  } catch (err) {
    console.error("joinEventWithCode error:", err);
    return res.status(500).json({ error: "Unable to join event" });
  }
}

export async function lockMyProblemSelection(req, res) {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id || req.user?.sub;
    const problemId = String(req.body?.problemId || "").trim();

    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }
    if (!isValidObjectId(problemId)) {
      return res.status(400).json({ error: "Invalid problemId" });
    }

    const event = await Event.findById(eventId).select("_id endAt").lean();
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    if (new Date(event.endAt).getTime() < Date.now()) {
      return res.status(403).json({ error: "Event has already ended" });
    }

    const attendance = await EventAttendance.findOne({
      eventId,
      userId,
    })
      .select("_id")
      .lean();
    if (!attendance) {
      return res.status(422).json({
        error: "You are not registered for this event",
      });
    }

    const problem = await Problem.findOne({
      _id: problemId,
      isActive: true,
    })
      .select("_id title eventId eventIds")
      .lean();

    if (!problem) {
      return res.status(404).json({ error: "Problem not found" });
    }

    const linkedEventId = String(
      problem.eventId ||
        (Array.isArray(problem.eventIds) ? problem.eventIds[0] : ""),
    );

    if (linkedEventId !== String(eventId)) {
      return res.status(422).json({
        error: "Problem is not assigned to this event",
      });
    }

    const existing = await ProblemSelection.findOne({ eventId, userId }).lean();

    if (
      existing?.isLocked &&
      String(existing.problemId) === String(problemId)
    ) {
      return res.json({
        message: "Problem already locked",
        selection: mapSelection(existing),
      });
    }

    if (existing?.isLocked) {
      return res.status(409).json({
        error: "Problem already locked for this event",
        lockedProblemId: String(existing.problemId),
      });
    }

    const selection = await ProblemSelection.findOneAndUpdate(
      { eventId, userId },
      {
        $set: {
          problemId,
          isLocked: true,
          lockedAt: new Date(),
          unlockedAt: null,
          unlockedBy: null,
          reason: "",
        },
      },
      {
        new: true,
        runValidators: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.json({
      message: "Problem locked successfully",
      selection: mapSelection(selection),
    });
  } catch (err) {
    console.error("lockMyProblemSelection error:", err);
    return res.status(500).json({ error: "Unable to lock problem selection" });
  }
}

export async function unlockMyProblemSelection(req, res) {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id || req.user?.sub;

    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const event = await Event.findById(eventId)
      .select("_id startAt endAt")
      .lean();
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    if (!canStudentUnlockForEvent(event)) {
      return res.status(403).json({
        error: "Unlock window is closed for this event",
      });
    }

    const selection = await ProblemSelection.findOne({
      eventId,
      userId,
      isLocked: true,
    });

    if (!selection) {
      return res.status(404).json({ error: "No locked problem found" });
    }

    const submissionsCount = await Submission.countDocuments({
      eventId,
      userId,
    });
    if (submissionsCount > 0) {
      return res.status(422).json({
        error: "Cannot unlock after submitting in this event",
      });
    }

    selection.isLocked = false;
    selection.unlockedAt = new Date();
    selection.unlockedBy = null;
    selection.reason = "student_unlock";
    await selection.save();

    return res.json({
      message: "Problem unlocked",
      selection: mapSelection(selection),
    });
  } catch (err) {
    console.error("unlockMyProblemSelection error:", err);
    return res
      .status(500)
      .json({ error: "Unable to unlock problem selection" });
  }
}

export async function listEventProblemSelections(req, res) {
  try {
    const { eventId } = req.params;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const event = await Event.findById(eventId).select("_id").lean();
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const [rows, total] = await Promise.all([
      ProblemSelection.find({ eventId, isLocked: true })
        .sort({ lockedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email")
        .populate("problemId", "title")
        .lean(),
      ProblemSelection.countDocuments({ eventId, isLocked: true }),
    ]);

    return res.json({
      count: rows.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      selections: rows.map((row) => ({
        id: String(row._id),
        eventId: String(row.eventId),
        user: {
          id: row.userId?._id
            ? String(row.userId._id)
            : String(row.userId || ""),
          name: row.userId?.name || "Unknown",
          email: row.userId?.email || "",
        },
        problem: {
          id: row.problemId?._id
            ? String(row.problemId._id)
            : String(row.problemId || ""),
          title: row.problemId?.title || "Unknown",
        },
        lockedAt: row.lockedAt,
      })),
    });
  } catch (err) {
    console.error("listEventProblemSelections error:", err);
    return res.status(500).json({ error: "Unable to fetch event selections" });
  }
}

export async function adminUnlockProblemSelection(req, res) {
  try {
    const { eventId, userId } = req.params;
    const reason = String(req.body?.reason || "").trim();
    const adminId = req.user?.id || req.user?.sub;

    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }
    if (!reason) {
      return res.status(400).json({ error: "reason is required" });
    }

    const selection = await ProblemSelection.findOne({
      eventId,
      userId,
      isLocked: true,
    });

    if (!selection) {
      return res
        .status(404)
        .json({ error: "No locked problem found for user" });
    }

    selection.isLocked = false;
    selection.unlockedAt = new Date();
    selection.unlockedBy = adminId;
    selection.reason = reason.slice(0, 300);
    await selection.save();

    await logAdminSelectionAction(
      req,
      "problem_selection.unlock",
      selection._id,
      {
        eventId: String(eventId),
        userId: String(userId),
        problemId: String(selection.problemId),
        reason: selection.reason,
      },
    );

    return res.json({
      message: "Problem selection unlocked",
      selection: mapSelection(selection),
    });
  } catch (err) {
    console.error("adminUnlockProblemSelection error:", err);
    return res
      .status(500)
      .json({ error: "Unable to unlock user problem selection" });
  }
}
