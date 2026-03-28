import Event from "../models/Event.js";
import EventLeaderboard from "../models/EventLeaderboard.js";
import Prize from "../models/Prize.js";
import PrizeAllocation from "../models/PrizeAllocation.js";
import AdminAuditLog from "../models/AdminAuditLog.js";

function toId(value) {
  return String(value || "").trim();
}

function serializePrize(prize) {
  return {
    id: String(prize._id),
    eventId: String(prize.eventId),
    title: prize.title,
    description: prize.description,
    kind: prize.kind,
    rankFrom: prize.rankFrom,
    rankTo: prize.rankTo,
    amount: prize.amount,
    currency: prize.currency,
    maxRecipients: prize.maxRecipients,
    isActive: prize.isActive,
    metadata: prize.metadata || {},
    createdAt: prize.createdAt,
    updatedAt: prize.updatedAt,
  };
}

function serializeAllocation(allocation) {
  const user =
    allocation.userId && typeof allocation.userId === "object"
      ? allocation.userId
      : null;
  const prize =
    allocation.prizeId && typeof allocation.prizeId === "object"
      ? allocation.prizeId
      : null;

  return {
    id: String(allocation._id),
    eventId: String(allocation.eventId),
    leaderboardSnapshotId: String(allocation.leaderboardSnapshotId),
    prizeId: prize
      ? {
          id: String(prize._id),
          title: prize.title,
          kind: prize.kind,
          amount: prize.amount,
          currency: prize.currency,
        }
      : String(allocation.prizeId),
    userId: user
      ? {
          id: String(user._id),
          name: user.name,
          email: user.email,
        }
      : String(allocation.userId),
    rank: allocation.rank,
    status: allocation.status,
    claimDetails: allocation.claimDetails,
    claimedAt: allocation.claimedAt,
    deliveredAt: allocation.deliveredAt,
    note: allocation.note,
    createdAt: allocation.createdAt,
    updatedAt: allocation.updatedAt,
  };
}

export async function createPrize(req, res) {
  try {
    const eventId = toId(req.params?.eventId);
    const {
      title,
      description,
      kind,
      rankFrom,
      rankTo,
      amount,
      currency,
      maxRecipients,
      metadata,
    } = req.body || {};

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const event = await Event.findById(eventId).select("_id title").lean();
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    const from = Number(rankFrom);
    const to = Number(rankTo);
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 1 ||
      to < from
    ) {
      return res
        .status(400)
        .json({ error: "rankFrom/rankTo must define a valid rank range" });
    }

    const created = await Prize.create({
      eventId,
      title: String(title).trim().slice(0, 120),
      description: String(description || "")
        .trim()
        .slice(0, 500),
      kind,
      rankFrom: from,
      rankTo: to,
      amount:
        amount === null || amount === undefined || amount === ""
          ? null
          : Number(amount),
      currency: String(currency || "INR")
        .trim()
        .slice(0, 10),
      maxRecipients:
        Number.isFinite(Number(maxRecipients)) && Number(maxRecipients) > 0
          ? Number(maxRecipients)
          : 1,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    });

    await AdminAuditLog.create({
      adminId: req.user?.id,
      action: "create_prize",
      targetType: "Prize",
      targetId: created._id,
      metadata: {
        eventId,
        title: created.title,
        rankFrom: created.rankFrom,
        rankTo: created.rankTo,
        eventTitle: event.title,
      },
    });

    return res.status(201).json({ prize: serializePrize(created) });
  } catch (err) {
    console.error("createPrize error:", err);
    return res.status(500).json({ error: "Unable to create prize" });
  }
}

export async function listEventPrizes(req, res) {
  try {
    const eventId = toId(req.params?.eventId);
    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const prizes = await Prize.find({ eventId })
      .sort({ rankFrom: 1, createdAt: 1 })
      .lean();

    return res.json({ prizes: prizes.map(serializePrize) });
  } catch (err) {
    console.error("listEventPrizes error:", err);
    return res.status(500).json({ error: "Unable to fetch prizes" });
  }
}

export async function updatePrize(req, res) {
  try {
    const prizeId = toId(req.params?.prizeId);
    if (!prizeId) {
      return res.status(400).json({ error: "prizeId is required" });
    }

    const existing = await Prize.findById(prizeId);
    if (!existing) {
      return res.status(404).json({ error: "Prize not found" });
    }

    const updates = {};
    const keys = [
      "title",
      "description",
      "kind",
      "amount",
      "currency",
      "maxRecipients",
      "isActive",
      "metadata",
      "rankFrom",
      "rankTo",
    ];

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        updates[key] = req.body[key];
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "title")) {
      updates.title = String(updates.title || "")
        .trim()
        .slice(0, 120);
      if (!updates.title) {
        return res.status(400).json({ error: "title cannot be empty" });
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "description")) {
      updates.description = String(updates.description || "")
        .trim()
        .slice(0, 500);
    }

    if (Object.prototype.hasOwnProperty.call(updates, "currency")) {
      updates.currency = String(updates.currency || "INR")
        .trim()
        .slice(0, 10);
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "rankFrom") ||
      Object.prototype.hasOwnProperty.call(updates, "rankTo")
    ) {
      const from = Number(
        Object.prototype.hasOwnProperty.call(updates, "rankFrom")
          ? updates.rankFrom
          : existing.rankFrom,
      );
      const to = Number(
        Object.prototype.hasOwnProperty.call(updates, "rankTo")
          ? updates.rankTo
          : existing.rankTo,
      );
      if (
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        from < 1 ||
        to < from
      ) {
        return res
          .status(400)
          .json({ error: "rankFrom/rankTo must define a valid rank range" });
      }
      updates.rankFrom = from;
      updates.rankTo = to;
    }

    const updated = await Prize.findByIdAndUpdate(prizeId, updates, {
      new: true,
      runValidators: true,
    });

    await AdminAuditLog.create({
      adminId: req.user?.id,
      action: "update_prize",
      targetType: "Prize",
      targetId: updated._id,
      metadata: {
        before: {
          title: existing.title,
          rankFrom: existing.rankFrom,
          rankTo: existing.rankTo,
          isActive: existing.isActive,
        },
        after: {
          title: updated.title,
          rankFrom: updated.rankFrom,
          rankTo: updated.rankTo,
          isActive: updated.isActive,
        },
      },
    });

    return res.json({ prize: serializePrize(updated) });
  } catch (err) {
    console.error("updatePrize error:", err);
    return res.status(500).json({ error: "Unable to update prize" });
  }
}

export async function archivePrize(req, res) {
  try {
    const prizeId = toId(req.params?.prizeId);
    if (!prizeId) {
      return res.status(400).json({ error: "prizeId is required" });
    }

    const updated = await Prize.findByIdAndUpdate(
      prizeId,
      { isActive: false },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ error: "Prize not found" });
    }

    await AdminAuditLog.create({
      adminId: req.user?.id,
      action: "archive_prize",
      targetType: "Prize",
      targetId: updated._id,
      metadata: { isActive: false },
    });

    return res.json({ prize: serializePrize(updated) });
  } catch (err) {
    console.error("archivePrize error:", err);
    return res.status(500).json({ error: "Unable to archive prize" });
  }
}

export async function allocateEventPrizes(req, res) {
  try {
    const eventId = toId(req.params?.eventId);
    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const leaderboard = await EventLeaderboard.findOne({ eventId })
      .sort({ computedAt: -1 })
      .lean();

    if (!leaderboard) {
      return res.status(404).json({ error: "Leaderboard not found" });
    }

    if (!leaderboard.isFinal) {
      return res
        .status(400)
        .json({ error: "Finalize event results before prize allocation" });
    }

    const prizes = await Prize.find({ eventId, isActive: true })
      .sort({ rankFrom: 1, rankTo: 1 })
      .lean();

    if (!prizes.length) {
      return res
        .status(400)
        .json({ error: "No active prizes found for event" });
    }

    const allocations = [];

    for (const prize of prizes) {
      const winners = leaderboard.entries.filter(
        (entry) =>
          Number(entry.rank) >= Number(prize.rankFrom) &&
          Number(entry.rank) <= Number(prize.rankTo),
      );

      const cappedWinners = winners.slice(
        0,
        Math.max(1, Number(prize.maxRecipients || 1)),
      );

      for (const winner of cappedWinners) {
        allocations.push({
          updateOne: {
            filter: {
              eventId,
              prizeId: prize._id,
              userId: winner.userId,
            },
            update: {
              $set: {
                eventId,
                leaderboardSnapshotId: leaderboard._id,
                prizeId: prize._id,
                userId: winner.userId,
                rank: winner.rank,
                status: "allocated",
              },
              $setOnInsert: {
                claimDetails: "",
                note: "",
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (allocations.length) {
      await PrizeAllocation.bulkWrite(allocations);
    }

    await AdminAuditLog.create({
      adminId: req.user?.id,
      action: "allocate_event_prizes",
      targetType: "Event",
      targetId: eventId,
      metadata: {
        prizes: prizes.length,
        allocations: allocations.length,
      },
    });

    const saved = await PrizeAllocation.find({ eventId })
      .populate("userId", "name email")
      .populate("prizeId", "title kind amount currency")
      .sort({ rank: 1, createdAt: 1 })
      .lean();

    return res.json({
      message: "Prize allocation completed",
      allocations: saved.map(serializeAllocation),
    });
  } catch (err) {
    console.error("allocateEventPrizes error:", err);
    return res.status(500).json({ error: "Unable to allocate prizes" });
  }
}

export async function listEventPrizeAllocations(req, res) {
  try {
    const eventId = toId(req.params?.eventId);
    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const allocations = await PrizeAllocation.find({ eventId })
      .populate("userId", "name email")
      .populate("prizeId", "title kind amount currency")
      .sort({ rank: 1, createdAt: -1 })
      .lean();

    return res.json({ allocations: allocations.map(serializeAllocation) });
  } catch (err) {
    console.error("listEventPrizeAllocations error:", err);
    return res.status(500).json({ error: "Unable to fetch prize allocations" });
  }
}

export async function markPrizeDelivered(req, res) {
  try {
    const allocationId = toId(req.params?.allocationId);
    if (!allocationId) {
      return res.status(400).json({ error: "allocationId is required" });
    }

    const allocation = await PrizeAllocation.findById(allocationId);
    if (!allocation) {
      return res.status(404).json({ error: "Prize allocation not found" });
    }

    allocation.status = "delivered";
    allocation.deliveredAt = new Date();
    allocation.deliveredBy = req.user?.id || null;
    allocation.note = String(req.body?.note || "").slice(0, 500);
    await allocation.save();

    await AdminAuditLog.create({
      adminId: req.user?.id,
      action: "mark_prize_delivered",
      targetType: "PrizeAllocation",
      targetId: allocation._id,
      metadata: {
        status: allocation.status,
        deliveredAt: allocation.deliveredAt,
      },
    });

    const populated = await PrizeAllocation.findById(allocation._id)
      .populate("userId", "name email")
      .populate("prizeId", "title kind amount currency")
      .lean();

    return res.json({ allocation: serializeAllocation(populated) });
  } catch (err) {
    console.error("markPrizeDelivered error:", err);
    return res.status(500).json({ error: "Unable to mark prize as delivered" });
  }
}

export async function claimPrize(req, res) {
  try {
    const allocationId = toId(req.params?.allocationId);
    const userId = toId(req.user?.id);

    if (!allocationId) {
      return res.status(400).json({ error: "allocationId is required" });
    }

    const allocation = await PrizeAllocation.findById(allocationId);
    if (!allocation) {
      return res.status(404).json({ error: "Prize allocation not found" });
    }

    if (String(allocation.userId) !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (allocation.status === "delivered") {
      return res.status(400).json({ error: "Prize is already delivered" });
    }

    const details = String(req.body?.claimDetails || "")
      .trim()
      .slice(0, 1000);
    if (!details) {
      return res.status(400).json({ error: "claimDetails is required" });
    }

    allocation.status = "claimed";
    allocation.claimDetails = details;
    allocation.claimedAt = new Date();
    await allocation.save();

    const populated = await PrizeAllocation.findById(allocation._id)
      .populate("userId", "name email")
      .populate("prizeId", "title kind amount currency")
      .lean();

    return res.json({ allocation: serializeAllocation(populated) });
  } catch (err) {
    console.error("claimPrize error:", err);
    return res.status(500).json({ error: "Unable to claim prize" });
  }
}

export async function getMyPrizes(req, res) {
  try {
    const userId = toId(req.user?.id);
    const allocations = await PrizeAllocation.find({ userId })
      .populate("userId", "name email")
      .populate("prizeId", "title kind amount currency")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ allocations: allocations.map(serializeAllocation) });
  } catch (err) {
    console.error("getMyPrizes error:", err);
    return res.status(500).json({ error: "Unable to fetch your prizes" });
  }
}
