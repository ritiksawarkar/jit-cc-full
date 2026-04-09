import cron from "node-cron";
import Event from "../models/Event.js";
import Problem from "../models/Problem.js";

let scheduler = null;
let isSweepRunning = false;

function deriveEventStatus(eventDoc, nowMs = Date.now()) {
  const startMs = new Date(eventDoc?.startAt || 0).getTime();
  const endMs = new Date(eventDoc?.endAt || 0).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return "upcoming";
  }
  if (nowMs > endMs) {
    return "completed";
  }
  if (nowMs >= startMs) {
    return "active";
  }
  return "upcoming";
}

export function isProblemExpiredByEvent(problemDoc, now = new Date()) {
  if (!problemDoc) return false;
  if (Boolean(problemDoc.isExpired)) return true;

  const eventDoc = problemDoc.eventId;
  if (!eventDoc || typeof eventDoc !== "object") return false;

  const endAtMs = new Date(eventDoc.endAt || 0).getTime();
  if (!Number.isFinite(endAtMs)) return false;
  return now.getTime() > endAtMs;
}

export async function expireProblemsForCompletedEvents({
  now = new Date(),
} = {}) {
  if (isSweepRunning) {
    return { skipped: true, reason: "sweep_already_running" };
  }

  isSweepRunning = true;
  try {
    const nowDate = now instanceof Date ? now : new Date(now);
    const nowMs = nowDate.getTime();

    const endedEvents = await Event.find({
      endAt: { $lt: nowDate },
      status: { $ne: "completed" },
    })
      .select("_id startAt endAt status")
      .lean();

    let eventsMarkedCompleted = 0;
    if (endedEvents.length > 0) {
      const endedIds = endedEvents.map((item) => item._id);
      const eventUpdate = await Event.updateMany(
        { _id: { $in: endedIds } },
        { $set: { status: "completed" } },
      );
      eventsMarkedCompleted = Number(eventUpdate.modifiedCount || 0);

      await Problem.updateMany(
        {
          eventId: { $in: endedIds },
          isExpired: { $ne: true },
        },
        {
          $set: {
            isExpired: true,
            expiredAt: nowDate,
          },
        },
      );
    }

    const staleEvents = await Event.find({
      endAt: { $gte: nowDate },
      status: { $in: ["upcoming", "active"] },
    })
      .select("_id startAt endAt status")
      .lean();

    const updates = { active: [], upcoming: [] };
    for (const event of staleEvents) {
      const nextStatus = deriveEventStatus(event, nowMs);
      if (nextStatus === "active" && event.status !== "active") {
        updates.active.push(event._id);
      } else if (nextStatus === "upcoming" && event.status !== "upcoming") {
        updates.upcoming.push(event._id);
      }
    }

    if (updates.active.length > 0) {
      await Event.updateMany(
        { _id: { $in: updates.active } },
        { $set: { status: "active" } },
      );
    }
    if (updates.upcoming.length > 0) {
      await Event.updateMany(
        { _id: { $in: updates.upcoming } },
        { $set: { status: "upcoming" } },
      );
    }

    return {
      skipped: false,
      endedEventsFound: endedEvents.length,
      eventsMarkedCompleted,
      now: nowDate.toISOString(),
    };
  } finally {
    isSweepRunning = false;
  }
}

export function startProblemExpiryScheduler() {
  if (scheduler) {
    return scheduler;
  }

  scheduler = cron.schedule("*/5 * * * *", async () => {
    try {
      await expireProblemsForCompletedEvents();
    } catch (err) {
      console.error("problem expiry scheduler error:", err);
    }
  });

  return scheduler;
}
