import mongoose from "mongoose";

const leaderboardEntrySchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true, min: 1 },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: { type: String, default: "", trim: true },
    userEmail: { type: String, default: "", trim: true },
    totalScore: { type: Number, default: 0 },
    totalPossibleScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    passedProblems: { type: Number, default: 0 },
    totalAttempts: { type: Number, default: 0 },
    lastSubmissionTime: { type: Date, default: null },
    merit: {
      type: String,
      enum: ["gold", "silver", "bronze", "none"],
      default: "none",
    },
    tiebreaker: {
      score: { type: Number, default: 0 },
      passedProblems: { type: Number, default: 0 },
      lastSubmissionTime: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
    },
  },
  { _id: false },
);

const eventLeaderboardSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      unique: true,
      index: true,
    },
    entries: {
      type: [leaderboardEntrySchema],
      default: [],
    },
    isFinal: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    computedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    stats: {
      totalParticipants: { type: Number, default: 0 },
      totalSubmissions: { type: Number, default: 0 },
      totalProblems: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

eventLeaderboardSchema.index({ isPublished: 1, eventId: 1 });

const EventLeaderboard = mongoose.model(
  "EventLeaderboard",
  eventLeaderboardSchema,
);

export default EventLeaderboard;
