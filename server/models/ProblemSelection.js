import mongoose from "mongoose";

const problemSelectionSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
      index: true,
    },
    isLocked: {
      type: Boolean,
      default: true,
      index: true,
    },
    lockedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    unlockedAt: {
      type: Date,
      default: null,
    },
    unlockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
  },
  { timestamps: true },
);

problemSelectionSchema.index({ eventId: 1, userId: 1 }, { unique: true });
problemSelectionSchema.index({ eventId: 1, isLocked: 1, lockedAt: -1 });
problemSelectionSchema.index({ eventId: 1, problemId: 1, isLocked: 1 });

const ProblemSelection = mongoose.model(
  "ProblemSelection",
  problemSelectionSchema,
);

export default ProblemSelection;
