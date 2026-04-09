import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    startAt: {
      type: Date,
      required: true,
      index: true,
    },
    endAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["upcoming", "active", "completed"],
      default: "upcoming",
      index: true,
    },
  },
  { timestamps: true },
);

eventSchema.index({ startAt: 1, endAt: 1 });

eventSchema.pre("validate", function setDerivedStatus(next) {
  const nowMs = Date.now();
  const startMs = new Date(this.startAt || 0).getTime();
  const endMs = new Date(this.endAt || 0).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return next();
  }

  if (nowMs > endMs) {
    this.status = "completed";
  } else if (nowMs >= startMs) {
    this.status = "active";
  } else {
    this.status = "upcoming";
  }

  return next();
});

eventSchema.virtual("startDate").get(function getStartDate() {
  return this.startAt;
});

eventSchema.virtual("endDate").get(function getEndDate() {
  return this.endAt;
});

eventSchema.set("toJSON", { virtuals: true });
eventSchema.set("toObject", { virtuals: true });

const Event = mongoose.model("Event", eventSchema);
export default Event;
