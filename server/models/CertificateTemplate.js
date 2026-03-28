import mongoose from "mongoose";

const certificateTemplateSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    templateText: {
      type: String,
      default: "",
      maxlength: 8000,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
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

certificateTemplateSchema.index({ eventId: 1, name: 1 }, { unique: true });

const CertificateTemplate = mongoose.model(
  "CertificateTemplate",
  certificateTemplateSchema,
);
export default CertificateTemplate;
