import mongoose from "mongoose";
import Event from "../models/Event.js";
import EventLeaderboard from "../models/EventLeaderboard.js";
import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";
import User from "../models/User.js";
import AdminAuditLog from "../models/AdminAuditLog.js";

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function roundTo(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function byScoreAndTiebreak(a, b) {
  if (b.totalScore !== a.totalScore) {
    return b.totalScore - a.totalScore;
  }
  if (b.passedProblems !== a.passedProblems) {
    return b.passedProblems - a.passedProblems;
  }

  const aTime = a.lastSubmissionTime
    ? new Date(a.lastSubmissionTime).getTime()
    : Number.MAX_SAFE_INTEGER;
  const bTime = b.lastSubmissionTime
    ? new Date(b.lastSubmissionTime).getTime()
    : Number.MAX_SAFE_INTEGER;
  if (aTime !== bTime) {
    return aTime - bTime;
  }

  return a.totalAttempts - b.totalAttempts;
}

function toMerit(rank) {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "none";
}

function assignRanks(entries) {
  let last = null;
  let rank = 0;

  return entries.map((entry, index) => {
    const sameAsLast =
      last &&
      last.totalScore === entry.totalScore &&
      last.passedProblems === entry.passedProblems &&
      String(last.lastSubmissionTime || "") ===
        String(entry.lastSubmissionTime || "") &&
      last.totalAttempts === entry.totalAttempts;

    if (!sameAsLast) {
      rank = index + 1;
    }

    last = entry;

    return {
      ...entry,
      rank,
      merit: toMerit(rank),
      tiebreaker: {
        score: entry.totalScore,
        passedProblems: entry.passedProblems,
        lastSubmissionTime: entry.lastSubmissionTime,
        attempts: entry.totalAttempts,
      },
    };
  });
}

async function logAdminAction(
  req,
  action,
  targetType,
  targetId,
  metadata = {},
) {
  const adminId = req.user?.id || req.user?.sub;
  if (!adminId) return;

  try {
    await AdminAuditLog.create({
      adminId,
      action: String(action || "").slice(0, 120),
      targetType: String(targetType || "").slice(0, 80),
      targetId: String(targetId || "").slice(0, 120),
      metadata,
    });
  } catch (err) {
    console.error("eventResults.logAdminAction error:", err);
  }
}

async function computeLeaderboard(eventId) {
  const [event, submissions, eventProblems, users] = await Promise.all([
    Event.findById(eventId).lean(),
    Submission.find({ eventId }).lean(),
    Problem.find({
      $or: [{ eventId }, { eventIds: eventId }],
      isCompetitive: true,
      isActive: true,
    })
      .select("_id totalPoints passingThreshold title")
      .lean(),
    User.find({}).select("_id name email").lean(),
  ]);

  if (!event) {
    return { error: "Event not found", status: 404 };
  }

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const problemMap = new Map(eventProblems.map((p) => [String(p._id), p]));

  const byUserProblem = new Map();

  for (const sub of submissions) {
    const userKey = String(sub.userId || "");
    const problemKey = String(sub.problemId || "");
    if (!userKey || !problemKey) continue;

    const key = `${userKey}::${problemKey}`;
    const current = byUserProblem.get(key);
    if (!current) {
      byUserProblem.set(key, sub);
      continue;
    }

    const currentScore = Number(current?.score?.earned || 0);
    const nextScore = Number(sub?.score?.earned || 0);

    if (nextScore > currentScore) {
      byUserProblem.set(key, sub);
      continue;
    }

    if (nextScore === currentScore) {
      const currentTime = new Date(current.createdAt || 0).getTime();
      const nextTime = new Date(sub.createdAt || 0).getTime();
      if (nextTime < currentTime) {
        byUserProblem.set(key, sub);
      }
    }
  }

  const perUser = new Map();

  for (const [key, sub] of byUserProblem.entries()) {
    const [userId, problemId] = key.split("::");
    const problem = problemMap.get(problemId);

    // If no event-bound problem is found, still include fallback by submission total.
    const possible = Number(problem?.totalPoints || sub?.score?.total || 100);
    const earned = Number(sub?.score?.earned || 0);

    if (!perUser.has(userId)) {
      perUser.set(userId, {
        userId,
        totalScore: 0,
        totalPossibleScore: 0,
        passedProblems: 0,
        totalAttempts: 0,
        lastSubmissionTime: null,
      });
    }

    const row = perUser.get(userId);
    row.totalScore += earned;
    row.totalPossibleScore += possible;

    const threshold = Number(problem?.passingThreshold ?? 100);
    const percentage = Number(sub?.score?.percentage || 0);
    if (percentage >= threshold || String(sub?.status || "") === "Accepted") {
      row.passedProblems += 1;
    }

    row.totalAttempts += 1;

    const createdAt = sub?.createdAt ? new Date(sub.createdAt) : null;
    if (
      createdAt &&
      (!row.lastSubmissionTime || createdAt > row.lastSubmissionTime)
    ) {
      row.lastSubmissionTime = createdAt;
    }
  }

  const entries = Array.from(perUser.values()).map((row) => {
    const percentage =
      row.totalPossibleScore > 0
        ? roundTo((row.totalScore / row.totalPossibleScore) * 100, 2)
        : 0;
    const user = userMap.get(String(row.userId)) || {};

    return {
      userId: row.userId,
      userName: String(user.name || "Unknown User"),
      userEmail: String(user.email || ""),
      totalScore: roundTo(row.totalScore, 2),
      totalPossibleScore: roundTo(row.totalPossibleScore, 2),
      percentage,
      passedProblems: row.passedProblems,
      totalAttempts: row.totalAttempts,
      lastSubmissionTime: row.lastSubmissionTime,
    };
  });

  entries.sort(byScoreAndTiebreak);
  const ranked = assignRanks(entries);

  return {
    event,
    entries: ranked,
    stats: {
      totalParticipants: ranked.length,
      totalSubmissions: submissions.length,
      totalProblems: eventProblems.length,
    },
  };
}

export async function computeEventResults(req, res) {
  try {
    const { eventId } = req.params;
    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const computed = await computeLeaderboard(eventId);
    if (computed.error) {
      return res.status(computed.status || 400).json({ error: computed.error });
    }

    const leaderboard = await EventLeaderboard.findOneAndUpdate(
      { eventId },
      {
        eventId,
        entries: computed.entries,
        stats: computed.stats,
        computedAt: new Date(),
        isFinal: false,
        isPublished: false,
        finalizedAt: null,
        publishedAt: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    await logAdminAction(req, "event.results.compute", "event", eventId, {
      participants: computed.stats.totalParticipants,
      submissions: computed.stats.totalSubmissions,
      problems: computed.stats.totalProblems,
    });

    return res.json({ leaderboard });
  } catch (err) {
    console.error("computeEventResults error:", err);
    return res.status(500).json({ error: "Unable to compute event results" });
  }
}

export async function getEventResults(req, res) {
  try {
    const { eventId } = req.params;
    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const [event, leaderboard] = await Promise.all([
      Event.findById(eventId).lean(),
      EventLeaderboard.findOne({ eventId }).lean(),
    ]);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    return res.json({
      event: {
        id: String(event._id),
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
      },
      leaderboard: leaderboard || null,
    });
  } catch (err) {
    console.error("getEventResults error:", err);
    return res.status(500).json({ error: "Unable to fetch event results" });
  }
}

export async function finalizeEventResults(req, res) {
  try {
    const { eventId } = req.params;
    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    let leaderboard = await EventLeaderboard.findOne({ eventId });
    if (!leaderboard) {
      const computed = await computeLeaderboard(eventId);
      if (computed.error) {
        return res
          .status(computed.status || 400)
          .json({ error: computed.error });
      }

      leaderboard = await EventLeaderboard.create({
        eventId,
        entries: computed.entries,
        stats: computed.stats,
        computedAt: new Date(),
      });
    }

    leaderboard.isFinal = true;
    leaderboard.isPublished = true;
    leaderboard.finalizedAt = new Date();
    leaderboard.publishedAt = new Date();
    await leaderboard.save();

    await logAdminAction(req, "event.results.finalize", "event", eventId, {
      participants: leaderboard.stats?.totalParticipants || 0,
      entries: leaderboard.entries?.length || 0,
    });

    return res.json({
      message: "Event results finalized",
      leaderboard,
    });
  } catch (err) {
    console.error("finalizeEventResults error:", err);
    return res.status(500).json({ error: "Unable to finalize event results" });
  }
}

export async function getPublicEventLeaderboard(req, res) {
  try {
    const { eventId } = req.params;
    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const [event, leaderboard] = await Promise.all([
      Event.findById(eventId).lean(),
      EventLeaderboard.findOne({ eventId, isPublished: true, isFinal: true })
        .select(
          "entries isFinal isPublished computedAt finalizedAt publishedAt stats",
        )
        .lean(),
    ]);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (!leaderboard) {
      return res.status(404).json({ error: "Results are not published yet" });
    }

    return res.json({
      event: {
        id: String(event._id),
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
      },
      leaderboard,
    });
  } catch (err) {
    console.error("getPublicEventLeaderboard error:", err);
    return res
      .status(500)
      .json({ error: "Unable to fetch public leaderboard" });
  }
}
