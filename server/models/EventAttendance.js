import mongoose from "mongoose";

const eventAttendanceSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ["registered", "participated", "completed"],
      default: "registered",
      index: true,
    },
  },
  { timestamps: true },
);

eventAttendanceSchema.index({ eventId: 1, userId: 1 }, { unique: true });

eventAttendanceSchema.index({ eventId: 1, status: 1 });

const EventAttendance = mongoose.model(
  "EventAttendance",
  eventAttendanceSchema,
);
export default EventAttendance;
