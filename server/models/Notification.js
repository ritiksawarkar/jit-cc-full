import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // Recipient (always a student)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Notification type: system, event, account, submission, admin_message, problem, certificate
    type: {
      type: String,
      enum: [
        "system", // General system messages
        "event", // Event start, end, problem released
        "account", // Account freeze, password reset
        "submission", // Submission results, score
        "admin_message", // Direct admin message
        "problem", // Problem statement update
        "certificate", // Certificate issued/verified
      ],
      required: true,
      index: true,
    },

    // Title and message
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },

    message: {
      type: String,
      required: true,
      maxlength: 500,
    },

    // Description (optional longer text)
    description: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    // Related resource IDs
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },

    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      default: null,
    },

    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      default: null,
    },

    certificateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Certificate",
      default: null,
    },

    // Admin message sender
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Priority level: low, normal, high, critical
    priority: {
      type: String,
      enum: ["low", "normal", "high", "critical"],
      default: "normal",
      index: true,
    },

    // Action URL/path
    actionUrl: {
      type: String,
      default: null,
    },

    // Action button text (e.g., "View Event", "Review Submission")
    actionLabel: {
      type: String,
      default: null,
    },

    // Read status
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },

    // Notification can be pinned/important
    isPinned: {
      type: Boolean,
      default: false,
    },

    // Dismiss/Archive
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Additional metadata
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true },
);

// Index for efficient queries
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1 });
notificationSchema.index({ userId: 1, isArchived: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
