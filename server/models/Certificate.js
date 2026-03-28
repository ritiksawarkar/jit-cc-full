import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema(
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
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CertificateTemplate",
      required: true,
      index: true,
    },
    leaderboardSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventLeaderboard",
      required: true,
      index: true,
    },
    certificateNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    verificationCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["issued", "revoked"],
      default: "issued",
      index: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rank: {
      type: Number,
      default: null,
    },
    totalScore: {
      type: Number,
      default: 0,
    },
    merit: {
      type: String,
      default: "none",
      trim: true,
      maxlength: 20,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

certificateSchema.index({ eventId: 1, userId: 1 }, { unique: true });

const Certificate = mongoose.model("Certificate", certificateSchema);
export default Certificate;
