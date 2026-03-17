import mongoose from "mongoose";

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
  },
  { timestamps: true },
);

const Problem = mongoose.model("Problem", problemSchema);
export default Problem;
