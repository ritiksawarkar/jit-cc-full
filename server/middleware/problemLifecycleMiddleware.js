import mongoose from "mongoose";
import Event from "../models/Event.js";

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

export async function requireActiveEventForProblemMutation(req, res, next) {
  try {
    const eventId = String(req.body?.eventId || "").trim();
    if (!eventId) {
      return next();
    }

    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: "Invalid event selected" });
    }

    const event = await Event.findById(eventId).select("_id endAt").lean();
    if (!event) {
      return res.status(400).json({ error: "Invalid event selected" });
    }

    const endMs = new Date(event.endAt || 0).getTime();
    if (Number.isFinite(endMs) && Date.now() > endMs) {
      return res.status(422).json({
        error: "Event has already ended. Cannot add problems.",
      });
    }

    return next();
  } catch (err) {
    console.error("requireActiveEventForProblemMutation error:", err);
    return res
      .status(500)
      .json({ error: "Unable to validate event lifecycle" });
  }
}
