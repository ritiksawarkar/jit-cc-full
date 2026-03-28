import mongoose from "mongoose";

const prizeAllocationSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    leaderboardSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventLeaderboard",
      required: true,
      index: true,
    },
    prizeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prize",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rank: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["allocated", "claimed", "delivered", "rejected"],
      default: "allocated",
      index: true,
    },
    claimDetails: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    deliveredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    note: {
      type: String,
      default: "",
      maxlength: 500,
    },
  },
  { timestamps: true },
);

prizeAllocationSchema.index(
  { eventId: 1, prizeId: 1, userId: 1 },
  { unique: true },
);
prizeAllocationSchema.index({ userId: 1, createdAt: -1 });

const PrizeAllocation = mongoose.model(
  "PrizeAllocation",
  prizeAllocationSchema,
);
export default PrizeAllocation;
