import mongoose from "mongoose";

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
        "Wrong Answer",
        "Runtime Error",
        "Compilation Error",
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
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

submissionSchema.index({ userId: 1, createdAt: -1 });
submissionSchema.index({ problemId: 1, createdAt: -1 });

const Submission = mongoose.model("Submission", submissionSchema);
export default Submission;
