import mongoose from "mongoose";

const testCaseVerdictSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true, min: 0 },
    name: { type: String, default: "", trim: true },
    isHidden: { type: Boolean, default: true },
    input: { type: String, default: "" },
    expectedOutput: { type: String, default: "" },
    actualOutput: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "Accepted",
        "Wrong Answer",
        "Runtime Error",
        "Compilation Error",
        "Time Limit Exceeded",
      ],
      default: "Wrong Answer",
    },
    statusId: { type: Number, default: 0 },
    executionTime: { type: Number, default: 0 },
    memory: { type: Number, default: 0 },
    weight: { type: Number, default: 1 },
    earnedWeight: { type: Number, default: 0 },
    stderr: { type: String, default: "" },
    compileOutput: { type: String, default: "" },
  },
  { _id: false },
);

const submissionSchema = new mongoose.Schema(
  {
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
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
      index: true,
    },
    language: {
      type: String,
      required: true,
      trim: true,
    },
    sourceCode: {
      type: String,
      required: true,
    },
    input: {
      type: String,
      default: "",
    },
    output: {
      type: String,
      default: "",
    },
    expectedOutput: {
      type: String,
      required: true,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "Accepted",
        "Partial Accepted",
        "Wrong Answer",
        "Runtime Error",
        "Compilation Error",
        "Time Limit Exceeded",
      ],
      required: true,
      index: true,
    },
    executionTime: {
      type: Number,
      default: 0,
    },
    memory: {
      type: Number,
      required: false,
    },
    score: {
      total: { type: Number, default: 100 },
      earned: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
      passedCount: { type: Number, default: 0 },
      totalCount: { type: Number, default: 0 },
    },
    verdicts: {
      type: [testCaseVerdictSchema],
      default: [],
    },
    compileOutput: {
      type: String,
      default: "",
    },
    stderrRaw: {
      type: String,
      default: "",
    },
    judge0StatusId: {
      type: Number,
      default: 0,
    },
    evaluatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    problemSnapshot: {
      title: { type: String, default: "" },
      version: { type: Number, default: 1 },
      isCompetitive: { type: Boolean, default: true },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

submissionSchema.index({ userId: 1, createdAt: -1 });
submissionSchema.index({ problemId: 1, createdAt: -1 });
submissionSchema.index({ userId: 1, problemId: 1, createdAt: -1 });
submissionSchema.index({ status: 1, createdAt: -1 });
submissionSchema.index({ eventId: 1, createdAt: -1 });
submissionSchema.index({ eventId: 1, userId: 1, problemId: 1, createdAt: -1 });

const Submission = mongoose.model("Submission", submissionSchema);
export default Submission;
