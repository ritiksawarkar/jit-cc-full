import mongoose from "mongoose";

const roleChangeRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    currentRole: {
      type: String,
      enum: ["student", "admin"],
      required: true,
    },
    requestedRole: {
      type: String,
      enum: ["student", "admin"],
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: "",
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNote: {
      type: String,
      default: "",
      maxlength: 500,
    },
  },
  { timestamps: true },
);

roleChangeRequestSchema.index({ status: 1, createdAt: -1 });

const RoleChangeRequest = mongoose.model(
  "RoleChangeRequest",
  roleChangeRequestSchema,
);
export default RoleChangeRequest;
