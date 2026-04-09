import mongoose from "mongoose";
import Event from "./Event.js";

const testCaseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    input: {
      type: String,
      default: "",
    },
    expectedOutput: {
      type: String,
      required: true,
      default: "",
    },
    weight: {
      type: Number,
      default: 1,
      min: 0,
    },
    isHidden: {
      type: Boolean,
      default: true,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    timeLimitSeconds: {
      type: Number,
      default: 2,
      min: 0.1,
      max: 30,
    },
    memoryLimitKb: {
      type: Number,
      default: 131072,
      min: 1024,
      max: 524288,
    },
  },
  { _id: false },
);

const problemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    statement: {
      type: String,
      default: "",
    },
    expectedOutput: {
      type: String,
      required: true,
      default: "",
    },
    sampleInput: {
      type: String,
      default: "",
    },
    sampleOutput: {
      type: String,
      default: "",
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    isCompetitive: {
      type: Boolean,
      default: true,
      index: true,
    },
    testCases: {
      type: [testCaseSchema],
      default: [],
    },
    totalPoints: {
      type: Number,
      default: 100,
      min: 1,
    },
    passingThreshold: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    maxAttempts: {
      type: Number,
      default: null,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isExpired: {
      type: Boolean,
      default: false,
      index: true,
    },
    expiredAt: {
      type: Date,
      default: null,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { timestamps: true },
);

problemSchema.index({ isActive: 1, createdAt: -1 });
problemSchema.index({ eventId: 1, isCompetitive: 1 });
problemSchema.index({ eventId: 1, isExpired: 1 });

problemSchema.pre("validate", async function preventCreationOnEndedEvent(next) {
  try {
    if (!this.isNew) {
      return next();
    }

    const eventId = this.eventId;
    if (!eventId) {
      return next();
    }

    const event = await Event.findById(eventId).select("endAt").lean();
    if (!event) {
      this.invalidate("eventId", "Invalid event selected");
      return next();
    }

    const endMs = new Date(event.endAt || 0).getTime();
    if (Number.isFinite(endMs) && Date.now() > endMs) {
      this.invalidate(
        "eventId",
        "Event has already ended. Cannot add problems.",
      );
    }

    return next();
  } catch (err) {
    return next(err);
  }
});

const Problem = mongoose.model("Problem", problemSchema);
export default Problem;
