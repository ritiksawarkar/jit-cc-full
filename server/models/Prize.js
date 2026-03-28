import mongoose from "mongoose";

const prizeSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    kind: {
      type: String,
      enum: ["cash", "voucher", "gift", "custom"],
      default: "custom",
      index: true,
    },
    rankFrom: {
      type: Number,
      required: true,
      min: 1,
    },
    rankTo: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      default: null,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
      maxlength: 10,
    },
    maxRecipients: {
      type: Number,
      default: 1,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

prizeSchema.index({ eventId: 1, rankFrom: 1, rankTo: 1 });

const Prize = mongoose.model("Prize", prizeSchema);
export default Prize;
