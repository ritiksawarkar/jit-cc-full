import Submission from "../models/Submission.js";
import User from "../models/User.js";
import Problem from "../models/Problem.js";
import Event from "../models/Event.js";
import mongoose from "mongoose";
import crypto from "node:crypto";
import EventAttendance from "../models/EventAttendance.js";
import AdminAuditLog from "../models/AdminAuditLog.js";
import {
  notifyAccountFreeze,
  notifyAccountUnfrozen,
} from "../services/notificationService.js";

const ATTENDANCE_STATUSES = ["registered", "participated", "completed"];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateValue(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

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

function normalizeEventPayload(body = {}) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const startAt = parseDateValue(body.startDate || body.startAt);
  const endAt = parseDateValue(body.endDate || body.endAt);

  if (!title) {
    return { error: "Event title is required" };
  }
  if (!startAt || !endAt) {
    return { error: "Valid startAt and endAt are required" };
  }
  if (endAt <= startAt) {
    return { error: "endAt must be greater than startAt" };
  }

  return {
    value: {
      title: title.slice(0, 200),
      description: description.slice(0, 2000),
      startAt,
      endAt,
    },
  };
}

function mapEvent(eventDoc) {
  const status =
    String(eventDoc?.status || "").trim() || deriveEventStatus(eventDoc);
  return {
    id: String(eventDoc._id),
    title: eventDoc.title,
    description: eventDoc.description || "",
    startDate: eventDoc.startAt,
    endDate: eventDoc.endAt,
    startAt: eventDoc.startAt,
    endAt: eventDoc.endAt,
    status,
    createdBy: eventDoc.createdBy ? String(eventDoc.createdBy) : null,
    createdAt: eventDoc.createdAt,
    updatedAt: eventDoc.updatedAt,
  };
}

function mapAuditLog(item) {
  return {
    id: String(item._id),
    action: item.action,
    targetType: item.targetType,
    targetId: item.targetId,
    metadata: item.metadata || {},
    createdAt: item.createdAt,
    admin: {
      id: item.adminId?._id
        ? String(item.adminId._id)
        : String(item.adminId || ""),
      name: item.adminId?.name || "Unknown Admin",
      email: item.adminId?.email || "",
    },
  };
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
    console.error("logAdminAction error:", err);
  }
}

async function findEventOverlaps({ startAt, endAt, excludeEventId = null }) {
  const query = {
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  };

  if (excludeEventId) {
    query._id = { $ne: excludeEventId };
  }

  const overlaps = await Event.find(query).sort({ startAt: 1 }).lean();
  return overlaps;
}

export async function getStudentsForAdmin(_req, res) {
  try {
    const students = await User.find({ role: "student" })
      .select(
        "name email role createdAt isFrozen frozenReason frozenAt mustResetPassword passwordResetForcedAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      count: students.length,
      students: students.map((s) => ({
        id: String(s._id),
        name: s.name,
        email: s.email,
        role: s.role,
        createdAt: s.createdAt,
        isFrozen: Boolean(s.isFrozen),
        frozenReason: s.frozenReason || "",
        frozenAt: s.frozenAt,
        mustResetPassword: Boolean(s.mustResetPassword),
        passwordResetForcedAt: s.passwordResetForcedAt,
      })),
    });
  } catch (err) {
    console.error("getStudentsForAdmin error:", err);
    return res.status(500).json({ error: "Unable to fetch students" });
  }
}

export async function setStudentFreezeState(req, res) {
  try {
    const { userId } = req.params;
    const frozen = Boolean(req.body?.frozen);
    const reason = String(req.body?.reason || "").trim();

    if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const user = await User.findById(userId).select("name email role isFrozen");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (String(user.role) !== "student") {
      return res.status(400).json({
        error: "Freeze/unfreeze is only supported for student accounts",
      });
    }

    user.isFrozen = frozen;
    user.frozenAt = frozen ? new Date() : null;
    user.frozenReason = frozen ? reason.slice(0, 300) : "";
    await user.save();

    // Send freeze/unfreeze notification to student
    try {
      if (frozen) {
        await notifyAccountFreeze(String(user._id), reason || "");
      } else {
        await notifyAccountUnfrozen(
          String(user._id),
          "Your account has been reactivated",
        );
      }
    } catch (notifErr) {
      console.error("Error sending freeze notification:", notifErr);
    }

    await logAdminAction(
      req,
      frozen ? "student.freeze" : "student.unfreeze",
      "user",
      userId,
      { reason: user.frozenReason || "" },
    );

    return res.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        isFrozen: Boolean(user.isFrozen),
        frozenAt: user.frozenAt,
        frozenReason: user.frozenReason || "",
      },
    });
  } catch (err) {
    console.error("setStudentFreezeState error:", err);
    return res.status(500).json({ error: "Unable to update freeze state" });
  }
}

export async function forceStudentPasswordReset(req, res) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const user = await User.findById(userId).select("name email role");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (String(user.role) !== "student") {
      return res.status(400).json({
        error:
          "Password reset quick control is only supported for student accounts",
      });
    }

    const tempPassword = crypto
      .randomBytes(9)
      .toString("base64url")
      .slice(0, 12);
    user.password = tempPassword;
    user.mustResetPassword = true;
    user.passwordResetForcedAt = new Date();
    await user.save();

    await logAdminAction(req, "student.force_password_reset", "user", userId, {
      email: user.email,
    });

    return res.json({
      userId: String(user._id),
      tempPassword,
      mustResetPassword: true,
      passwordResetForcedAt: user.passwordResetForcedAt,
    });
  } catch (err) {
    console.error("forceStudentPasswordReset error:", err);
    return res.status(500).json({ error: "Unable to force password reset" });
  }
}

export async function getAdminAuditLogs(req, res) {
  try {
    const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)));
    const items = await AdminAuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("adminId", "name email")
      .lean();

    return res.json({
      count: items.length,
      logs: items.map(mapAuditLog),
    });
  } catch (err) {
    console.error("getAdminAuditLogs error:", err);
    return res.status(500).json({ error: "Unable to fetch audit logs" });
  }
}

export async function getEventAttendanceSummary(_req, res) {
  try {
    const events = await Event.find({}).sort({ startAt: 1 }).lean();

    const attendanceAgg = await EventAttendance.aggregate([
      {
        $group: {
          _id: { eventId: "$eventId", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map();
    for (const row of attendanceAgg) {
      const eventId = String(row._id.eventId);
      if (!countMap.has(eventId)) {
        countMap.set(eventId, { registered: 0, participated: 0, completed: 0 });
      }
      const bucket = countMap.get(eventId);
      if (ATTENDANCE_STATUSES.includes(row._id.status)) {
        bucket[row._id.status] = row.count;
      }
    }

    return res.json({
      count: events.length,
      events: events.map((e) => {
        const counts = countMap.get(String(e._id)) || {
          registered: 0,
          participated: 0,
          completed: 0,
        };
        return {
          id: String(e._id),
          title: e.title,
          startAt: e.startAt,
          endAt: e.endAt,
          attendance: counts,
        };
      }),
    });
  } catch (err) {
    console.error("getEventAttendanceSummary error:", err);
    return res
      .status(500)
      .json({ error: "Unable to fetch attendance summary" });
  }
}

export async function upsertEventAttendance(req, res) {
  try {
    const { eventId } = req.params;
    const userId = String(req.body?.userId || "");
    const status = String(req.body?.status || "registered").toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(String(eventId || ""))) {
      return res.status(400).json({ error: "Invalid eventId" });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }
    if (!ATTENDANCE_STATUSES.includes(status)) {
      return res.status(400).json({
        error: "status must be registered, participated, or completed",
      });
    }

    const [event, user] = await Promise.all([
      Event.findById(eventId).select("title").lean(),
      User.findById(userId).select("name email role").lean(),
    ]);
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (!user) return res.status(404).json({ error: "User not found" });

    const updated = await EventAttendance.findOneAndUpdate(
      { eventId, userId },
      { status },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    await logAdminAction(
      req,
      "event.attendance.upsert",
      "event-attendance",
      `${eventId}:${userId}`,
      {
        eventId,
        eventTitle: event.title,
        userId,
        userEmail: user.email,
        status,
      },
    );

    return res.json({
      attendance: {
        id: String(updated._id),
        eventId: String(updated.eventId),
        userId: String(updated.userId),
        status: updated.status,
      },
    });
  } catch (err) {
    console.error("upsertEventAttendance error:", err);
    return res.status(500).json({ error: "Unable to save attendance status" });
  }
}

export async function bulkUpsertEventAttendance(req, res) {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ error: "rows array is required" });
    }
    if (rows.length > 5000) {
      return res
        .status(400)
        .json({ error: "Maximum 5000 rows allowed per upload" });
    }

    const eventIdSet = new Set();
    const userIdSet = new Set();
    const eventTitleSet = new Set();
    const userEmailSet = new Set();

    for (const row of rows) {
      const eventId = String(row?.eventId || "").trim();
      const userId = String(row?.userId || "").trim();
      const eventTitle = String(row?.eventTitle || "")
        .trim()
        .toLowerCase();
      const userEmail = String(row?.userEmail || "")
        .trim()
        .toLowerCase();

      if (eventId && mongoose.Types.ObjectId.isValid(eventId))
        eventIdSet.add(eventId);
      if (userId && mongoose.Types.ObjectId.isValid(userId))
        userIdSet.add(userId);
      if (eventTitle) eventTitleSet.add(eventTitle);
      if (userEmail) userEmailSet.add(userEmail);
    }

    const [eventsById, usersById, eventsByTitle, usersByEmail] =
      await Promise.all([
        Event.find({ _id: { $in: [...eventIdSet] } })
          .select("title")
          .lean(),
        User.find({ _id: { $in: [...userIdSet] } })
          .select("name email role")
          .lean(),
        Event.find({ title: { $in: [...eventTitleSet] } })
          .select("title")
          .lean(),
        User.find({ email: { $in: [...userEmailSet] } })
          .select("name email role")
          .lean(),
      ]);

    const eventMapById = new Map(eventsById.map((e) => [String(e._id), e]));
    const userMapById = new Map(usersById.map((u) => [String(u._id), u]));
    const eventMapByTitle = new Map(
      eventsByTitle.map((e) => [
        String(e.title || "")
          .trim()
          .toLowerCase(),
        e,
      ]),
    );
    const userMapByEmail = new Map(
      usersByEmail.map((u) => [
        String(u.email || "")
          .trim()
          .toLowerCase(),
        u,
      ]),
    );

    const failures = [];
    const ops = [];
    const successPreview = [];

    for (let idx = 0; idx < rows.length; idx += 1) {
      const line = rows[idx] || {};
      const rowNumber = idx + 2;

      const rawStatus = String(line.status || "registered")
        .trim()
        .toLowerCase();
      const status = ATTENDANCE_STATUSES.includes(rawStatus) ? rawStatus : "";
      if (!status) {
        failures.push({
          row: rowNumber,
          error: "Invalid status (must be registered/participated/completed)",
        });
        continue;
      }

      const eventIdRaw = String(line.eventId || "").trim();
      const userIdRaw = String(line.userId || "").trim();
      const eventTitleRaw = String(line.eventTitle || "")
        .trim()
        .toLowerCase();
      const userEmailRaw = String(line.userEmail || "")
        .trim()
        .toLowerCase();

      let eventDoc = null;
      if (eventIdRaw && mongoose.Types.ObjectId.isValid(eventIdRaw)) {
        eventDoc = eventMapById.get(eventIdRaw) || null;
      }
      if (!eventDoc && eventTitleRaw) {
        eventDoc = eventMapByTitle.get(eventTitleRaw) || null;
      }
      if (!eventDoc) {
        failures.push({
          row: rowNumber,
          error: "Event not found (provide valid eventId or eventTitle)",
        });
        continue;
      }

      let userDoc = null;
      if (userIdRaw && mongoose.Types.ObjectId.isValid(userIdRaw)) {
        userDoc = userMapById.get(userIdRaw) || null;
      }
      if (!userDoc && userEmailRaw) {
        userDoc = userMapByEmail.get(userEmailRaw) || null;
      }
      if (!userDoc) {
        failures.push({
          row: rowNumber,
          error: "User not found (provide valid userId or userEmail)",
        });
        continue;
      }

      ops.push({
        updateOne: {
          filter: { eventId: eventDoc._id, userId: userDoc._id },
          update: { $set: { status } },
          upsert: true,
        },
      });

      if (successPreview.length < 25) {
        successPreview.push({
          row: rowNumber,
          eventId: String(eventDoc._id),
          eventTitle: eventDoc.title,
          userId: String(userDoc._id),
          userEmail: userDoc.email,
          status,
        });
      }
    }

    if (ops.length) {
      await EventAttendance.bulkWrite(ops, { ordered: false });
    }

    await logAdminAction(
      req,
      "event.attendance.bulk_upsert",
      "event-attendance",
      "bulk",
      {
        totalRows: rows.length,
        processed: ops.length,
        failed: failures.length,
      },
    );

    return res.json({
      totalRows: rows.length,
      processed: ops.length,
      failed: failures.length,
      successPreview,
      failures: failures.slice(0, 200),
      warning:
        failures.length > 0
          ? "Some rows failed. Check failures array for details."
          : undefined,
    });
  } catch (err) {
    console.error("bulkUpsertEventAttendance error:", err);
    return res
      .status(500)
      .json({ error: "Unable to process bulk attendance upload" });
  }
}

export async function listEvents(req, res) {
  try {
    const scope = String(req.query.scope || "all").toLowerCase();
    const now = new Date();
    const query = {};

    if (scope === "future") {
      query.startAt = { $gt: now };
    } else if (scope === "current") {
      query.startAt = { $lte: now };
      query.endAt = { $gte: now };
    } else if (scope === "past") {
      query.endAt = { $lt: now };
    }

    const sort = scope === "past" ? { endAt: -1 } : { startAt: 1 };
    const events = await Event.find(query).sort(sort).lean();
    return res.json({ count: events.length, events: events.map(mapEvent) });
  } catch (err) {
    console.error("listEvents error:", err);
    return res.status(500).json({ error: "Unable to fetch events" });
  }
}

export async function createEvent(req, res) {
  try {
    const normalized = normalizeEventPayload(req.body || {});
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error });
    }

    const overlaps = await findEventOverlaps({
      startAt: normalized.value.startAt,
      endAt: normalized.value.endAt,
    });
    if (overlaps.length > 0) {
      return res.status(409).json({
        error: "Event time overlaps with existing event(s)",
        warning:
          "Selected time range conflicts with one or more events. Please adjust the schedule.",
        conflicts: overlaps.map(mapEvent),
      });
    }

    const created = await Event.create({
      ...normalized.value,
      createdBy: req.user?.id || req.user?.sub || null,
    });
    await logAdminAction(req, "event.create", "event", String(created._id), {
      title: created.title,
      startAt: created.startAt,
      endAt: created.endAt,
    });
    return res.status(201).json({ event: mapEvent(created.toObject()) });
  } catch (err) {
    console.error("createEvent error:", err);
    return res.status(500).json({ error: "Unable to create event" });
  }
}

export async function getEventById(req, res) {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(eventId || ""))) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const event = await Event.findById(eventId).lean();
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    return res.json({ event: mapEvent(event) });
  } catch (err) {
    console.error("getEventById error:", err);
    return res.status(500).json({ error: "Unable to fetch event" });
  }
}

export async function updateEvent(req, res) {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(eventId || ""))) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const normalized = normalizeEventPayload(req.body || {});
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error });
    }

    const overlaps = await findEventOverlaps({
      startAt: normalized.value.startAt,
      endAt: normalized.value.endAt,
      excludeEventId: eventId,
    });
    if (overlaps.length > 0) {
      return res.status(409).json({
        error: "Event time overlaps with existing event(s)",
        warning:
          "Selected time range conflicts with one or more events. Please adjust the schedule.",
        conflicts: overlaps.map(mapEvent),
      });
    }

    const updated = await Event.findByIdAndUpdate(eventId, normalized.value, {
      new: true,
      runValidators: true,
    }).lean();

    if (!updated) {
      return res.status(404).json({ error: "Event not found" });
    }

    await logAdminAction(req, "event.update", "event", String(updated._id), {
      title: updated.title,
      startAt: updated.startAt,
      endAt: updated.endAt,
    });

    return res.json({ event: mapEvent(updated) });
  } catch (err) {
    console.error("updateEvent error:", err);
    return res.status(500).json({ error: "Unable to update event" });
  }
}

export async function updateEventStatus(req, res) {
  try {
    const { eventId } = req.params;
    const nextStatus = String(req.body?.status || "")
      .trim()
      .toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(String(eventId || ""))) {
      return res.status(400).json({ error: "Invalid eventId" });
    }
    if (!["upcoming", "active", "completed"].includes(nextStatus)) {
      return res.status(400).json({
        error: "status must be one of upcoming, active, completed",
      });
    }

    const updated = await Event.findByIdAndUpdate(
      eventId,
      { status: nextStatus },
      { new: true, runValidators: true },
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (nextStatus === "completed") {
      await Problem.updateMany(
        { eventId: updated._id, isExpired: { $ne: true } },
        {
          $set: {
            isExpired: true,
            expiredAt: new Date(),
          },
        },
      );
    }

    await logAdminAction(
      req,
      "event.status.update",
      "event",
      String(updated._id),
      {
        status: nextStatus,
      },
    );

    return res.json({ event: mapEvent(updated) });
  } catch (err) {
    console.error("updateEventStatus error:", err);
    return res.status(500).json({ error: "Unable to update event status" });
  }
}

export async function deleteEvent(req, res) {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(eventId || ""))) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const linkedProblems = await Problem.countDocuments({ eventId });
    if (linkedProblems > 0) {
      return res.status(409).json({
        error: "Cannot delete event while problems are linked to it",
      });
    }

    const deleted = await Event.findByIdAndDelete(eventId).lean();
    if (!deleted) {
      return res.status(404).json({ error: "Event not found" });
    }

    await logAdminAction(req, "event.delete", "event", String(deleted._id), {
      title: deleted.title,
      startAt: deleted.startAt,
      endAt: deleted.endAt,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteEvent error:", err);
    return res.status(500).json({ error: "Unable to delete event" });
  }
}

export async function getAdminOverview(_req, res) {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const studentsPromise = User.find({ role: "student" })
      .select("name email role createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const [
      students,
      adminCount,
      totalSubmissions,
      todaySubmissions,
      totalProblems,
      statusBreakdownRaw,
      perStudentRaw,
      recentSubmissions,
      weekActivityCount,
      eventCurrentCount,
      eventPastCount,
      eventFutureCount,
      upcomingEvents,
    ] = await Promise.all([
      studentsPromise,
      User.countDocuments({ role: "admin" }),
      Submission.countDocuments({}),
      Submission.countDocuments({
        createdAt: { $gte: todayStart, $lt: tomorrowStart },
      }),
      Problem.countDocuments({}),
      Submission.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $project: { _id: 0, status: "$_id", count: 1 } },
      ]),
      Submission.aggregate([
        {
          $group: {
            _id: "$userId",
            submissionCount: { $sum: 1 },
            acceptedCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "Accepted"] }, 1, 0],
              },
            },
            latestSubmissionAt: { $max: "$createdAt" },
          },
        },
      ]),
      Submission.find({})
        .sort({ createdAt: -1 })
        .limit(200)
        .select(
          "userId problemId language status executionTime memory createdAt sourceCode input output expectedOutput",
        )
        .populate("userId", "name email role")
        .populate("problemId", "title")
        .lean(),
      Submission.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Event.countDocuments({ startAt: { $lte: now }, endAt: { $gte: now } }),
      Event.countDocuments({ endAt: { $lt: now } }),
      Event.countDocuments({ startAt: { $gt: now } }),
      Event.find({ startAt: { $gt: now } })
        .sort({ startAt: 1 })
        .limit(10)
        .lean(),
    ]);

    const statusBreakdown = {
      Accepted: 0,
      "Partial Accepted": 0,
      "Wrong Answer": 0,
      "Runtime Error": 0,
      "Compilation Error": 0,
      "Time Limit Exceeded": 0,
    };
    for (const row of statusBreakdownRaw) {
      if (Object.prototype.hasOwnProperty.call(statusBreakdown, row.status)) {
        statusBreakdown[row.status] = row.count;
      }
    }

    const perStudentMap = new Map(
      perStudentRaw.map((row) => [
        String(row._id),
        {
          submissionCount: row.submissionCount || 0,
          acceptedCount: row.acceptedCount || 0,
          latestSubmissionAt: row.latestSubmissionAt || null,
        },
      ]),
    );

    const studentsWithActivity = students.map((student) => {
      const s = perStudentMap.get(String(student._id)) || {
        submissionCount: 0,
        acceptedCount: 0,
        latestSubmissionAt: null,
      };
      const acceptanceRate = s.submissionCount
        ? Number(((s.acceptedCount / s.submissionCount) * 100).toFixed(1))
        : 0;
      return {
        id: String(student._id),
        name: student.name,
        email: student.email,
        role: student.role,
        createdAt: student.createdAt,
        submissionCount: s.submissionCount,
        acceptedCount: s.acceptedCount,
        acceptanceRate,
        latestSubmissionAt: s.latestSubmissionAt,
      };
    });

    const submissionHistoryBuckets = {
      current: recentSubmissions.filter(
        (x) => new Date(x.createdAt) >= todayStart,
      ),
      past: recentSubmissions.filter((x) => new Date(x.createdAt) < todayStart),
    };

    const avgDailyRecent = Number((weekActivityCount / 7).toFixed(2));
    const projectedNext7Days = Math.max(1, Math.round(avgDailyRecent * 7));

    return res.json({
      summary: {
        totalStudents: students.length,
        totalAdmins: adminCount,
        totalProblems,
        totalSubmissions,
        todaySubmissions,
        statusBreakdown,
      },
      students: studentsWithActivity,
      submissions: {
        recent: recentSubmissions.map((s) => ({
          id: String(s._id),
          createdAt: s.createdAt,
          language: s.language,
          status: s.status,
          executionTime: s.executionTime,
          memory: s.memory,
          sourceCode: s.sourceCode || "",
          input: s.input || "",
          output: s.output || "",
          expectedOutput: s.expectedOutput || "",
          user: {
            id: s.userId?._id ? String(s.userId._id) : String(s.userId || ""),
            name: s.userId?.name || "Unknown",
            email: s.userId?.email || "",
            role: s.userId?.role || "student",
          },
          problem: {
            id: s.problemId?._id
              ? String(s.problemId._id)
              : String(s.problemId || ""),
            title: s.problemId?.title || "Unknown Problem",
          },
        })),
        history: {
          currentCount: submissionHistoryBuckets.current.length,
          pastCount: submissionHistoryBuckets.past.length,
          futureProjectedCount: projectedNext7Days,
          avgDailyRecent,
        },
      },
      events: {
        history: {
          currentCount: eventCurrentCount,
          pastCount: eventPastCount,
          futureCount: eventFutureCount,
        },
        upcoming: upcomingEvents.map(mapEvent),
      },
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("getAdminOverview error:", err);
    return res.status(500).json({ error: "Unable to load admin overview" });
  }
}
