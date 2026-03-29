import crypto from "crypto";
import Event from "../models/Event.js";
import EventLeaderboard from "../models/EventLeaderboard.js";
import User from "../models/User.js";
import CertificateTemplate from "../models/CertificateTemplate.js";
import Certificate from "../models/Certificate.js";
import AdminAuditLog from "../models/AdminAuditLog.js";
import { notifyCertificateIssued } from "../services/notificationService.js";

function toId(value) {
  return String(value || "").trim();
}

function serialTemplate(template) {
  return {
    id: String(template._id),
    eventId: String(template.eventId),
    name: template.name,
    templateText: template.templateText,
    isDefault: template.isDefault,
    isActive: template.isActive,
    metadata: template.metadata || {},
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function serialCertificate(certificate) {
  const user =
    certificate.userId && typeof certificate.userId === "object"
      ? certificate.userId
      : null;
  const event =
    certificate.eventId && typeof certificate.eventId === "object"
      ? certificate.eventId
      : null;

  return {
    id: String(certificate._id),
    eventId: event
      ? {
          id: String(event._id),
          title: event.title,
        }
      : String(certificate.eventId),
    userId: user
      ? {
          id: String(user._id),
          name: user.name,
          email: user.email,
        }
      : String(certificate.userId),
    templateId:
      certificate.templateId && typeof certificate.templateId === "object"
        ? {
            id: String(certificate.templateId._id),
            name: certificate.templateId.name,
          }
        : String(certificate.templateId),
    certificateNo: certificate.certificateNo,
    verificationCode: certificate.verificationCode,
    status: certificate.status,
    issuedAt: certificate.issuedAt,
    rank: certificate.rank,
    totalScore: certificate.totalScore,
    merit: certificate.merit,
    payload: certificate.payload || {},
  };
}

function randomCode(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

export async function createCertificateTemplate(req, res) {
  try {
    const eventId = toId(req.params?.eventId);
    const { name, templateText, isDefault, metadata } = req.body || {};

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const event = await Event.findById(eventId).select("_id title").lean();
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const setDefault = Boolean(isDefault);
    if (setDefault) {
      await CertificateTemplate.updateMany(
        { eventId, isDefault: true },
        { $set: { isDefault: false } },
      );
    }

    const created = await CertificateTemplate.create({
      eventId,
      name: String(name).trim().slice(0, 120),
      templateText: String(templateText || "").slice(0, 8000),
      isDefault: setDefault,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    });

    await AdminAuditLog.create({
      adminId: req.user?.id,
      action: "create_certificate_template",
      targetType: "CertificateTemplate",
      targetId: created._id,
      metadata: {
        eventId,
        name: created.name,
        isDefault: created.isDefault,
      },
    });

    return res.status(201).json({ template: serialTemplate(created) });
  } catch (err) {
    console.error("createCertificateTemplate error:", err);
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ error: "Template name already exists for event" });
    }
    return res
      .status(500)
      .json({ error: "Unable to create certificate template" });
  }
}

export async function listCertificateTemplates(req, res) {
  try {
    const eventId = toId(req.params?.eventId);
    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const templates = await CertificateTemplate.find({ eventId })
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();

    return res.json({ templates: templates.map(serialTemplate) });
  } catch (err) {
    console.error("listCertificateTemplates error:", err);
    return res
      .status(500)
      .json({ error: "Unable to fetch certificate templates" });
  }
}

export async function updateCertificateTemplate(req, res) {
  try {
    const templateId = toId(req.params?.templateId);
    if (!templateId) {
      return res.status(400).json({ error: "templateId is required" });
    }

    const existing = await CertificateTemplate.findById(templateId);
    if (!existing) {
      return res.status(404).json({ error: "Certificate template not found" });
    }

    const updates = {};
    const keys = ["name", "templateText", "isDefault", "isActive", "metadata"];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        updates[key] = req.body[key];
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "name")) {
      updates.name = String(updates.name || "")
        .trim()
        .slice(0, 120);
      if (!updates.name) {
        return res.status(400).json({ error: "name cannot be empty" });
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "templateText")) {
      updates.templateText = String(updates.templateText || "").slice(0, 8000);
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "isDefault") &&
      updates.isDefault
    ) {
      await CertificateTemplate.updateMany(
        { eventId: existing.eventId, isDefault: true },
        { $set: { isDefault: false } },
      );
    }

    const updated = await CertificateTemplate.findByIdAndUpdate(
      templateId,
      updates,
      {
        new: true,
        runValidators: true,
      },
    );

    await AdminAuditLog.create({
      adminId: req.user?.id,
      action: "update_certificate_template",
      targetType: "CertificateTemplate",
      targetId: updated._id,
      metadata: {
        before: {
          name: existing.name,
          isDefault: existing.isDefault,
          isActive: existing.isActive,
        },
        after: {
          name: updated.name,
          isDefault: updated.isDefault,
          isActive: updated.isActive,
        },
      },
    });

    return res.json({ template: serialTemplate(updated) });
  } catch (err) {
    console.error("updateCertificateTemplate error:", err);
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ error: "Template name already exists for event" });
    }
    return res
      .status(500)
      .json({ error: "Unable to update certificate template" });
  }
}

export async function issueEventCertificates(req, res) {
  try {
    const eventId = toId(req.params?.eventId);
    const templateId = toId(req.body?.templateId);

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const event = await Event.findById(eventId).select("_id title").lean();
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const leaderboard = await EventLeaderboard.findOne({ eventId })
      .sort({ computedAt: -1 })
      .lean();

    if (!leaderboard || !leaderboard.isFinal) {
      return res
        .status(400)
        .json({ error: "Finalize event results before issuing certificates" });
    }

    let template = null;
    if (templateId) {
      template = await CertificateTemplate.findOne({
        _id: templateId,
        eventId,
        isActive: true,
      }).lean();
    } else {
      template = await CertificateTemplate.findOne({
        eventId,
        isDefault: true,
        isActive: true,
      }).lean();
      if (!template) {
        template = await CertificateTemplate.findOne({
          eventId,
          isActive: true,
        })
          .sort({ createdAt: 1 })
          .lean();
      }
    }

    if (!template) {
      return res
        .status(400)
        .json({ error: "No active certificate template found" });
    }

    const userIds = leaderboard.entries.map((entry) => entry.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select("name email")
      .lean();
    const usersById = new Map(users.map((user) => [String(user._id), user]));

    const ops = [];
    for (const entry of leaderboard.entries) {
      const user = usersById.get(String(entry.userId));
      if (!user) {
        continue;
      }

      const certNo = randomCode(`CERT-${eventId.slice(-6).toUpperCase()}`);
      const verifyCode = randomCode("VERIFY");

      ops.push({
        updateOne: {
          filter: { eventId, userId: entry.userId },
          update: {
            $set: {
              eventId,
              userId: entry.userId,
              templateId: template._id,
              leaderboardSnapshotId: leaderboard._id,
              status: "issued",
              issuedAt: new Date(),
              issuedBy: req.user?.id || null,
              rank: entry.rank,
              totalScore: Number(entry.totalScore || 0),
              merit: String(entry.merit || "none"),
              payload: {
                userName: user.name,
                userEmail: user.email,
                eventTitle: event.title,
                rank: entry.rank,
                totalScore: Number(entry.totalScore || 0),
                merit: String(entry.merit || "none"),
                generatedAt: new Date().toISOString(),
              },
            },
            $setOnInsert: {
              certificateNo: certNo,
              verificationCode: verifyCode,
            },
          },
          upsert: true,
        },
      });
    }

    if (ops.length) {
      await Certificate.bulkWrite(ops);
    }

    // Send certificate issued notifications to all students
    try {
      const issuedCerts = await Certificate.find({ eventId, status: "issued" })
        .select("_id userId certificateNo")
        .lean();

      for (const cert of issuedCerts) {
        await notifyCertificateIssued(String(cert.userId), cert, event.title);
      }
    } catch (notifErr) {
      console.error("Error sending certificate notifications:", notifErr);
      // Don't fail the response if notifications fail
    }

    await AdminAuditLog.create({
      adminId: req.user?.id,
      action: "issue_event_certificates",
      targetType: "Event",
      targetId: eventId,
      metadata: {
        templateId: String(template._id),
        certificatesIssued: ops.length,
      },
    });

    const certificates = await Certificate.find({ eventId })
      .populate("userId", "name email")
      .populate("eventId", "title")
      .populate("templateId", "name")
      .sort({ rank: 1, issuedAt: -1 })
      .lean();

    return res.json({
      message: "Certificates issued successfully",
      certificates: certificates.map(serialCertificate),
    });
  } catch (err) {
    console.error("issueEventCertificates error:", err);
    return res.status(500).json({ error: "Unable to issue certificates" });
  }
}

export async function listEventCertificates(req, res) {
  try {
    const eventId = toId(req.params?.eventId);
    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const certificates = await Certificate.find({ eventId })
      .populate("userId", "name email")
      .populate("eventId", "title")
      .populate("templateId", "name")
      .sort({ rank: 1, issuedAt: -1 })
      .lean();

    return res.json({ certificates: certificates.map(serialCertificate) });
  } catch (err) {
    console.error("listEventCertificates error:", err);
    return res
      .status(500)
      .json({ error: "Unable to fetch event certificates" });
  }
}

export async function getMyCertificates(req, res) {
  try {
    const userId = toId(req.user?.id);
    const certificates = await Certificate.find({ userId, status: "issued" })
      .populate("userId", "name email")
      .populate("eventId", "title")
      .populate("templateId", "name")
      .sort({ issuedAt: -1 })
      .lean();

    return res.json({ certificates: certificates.map(serialCertificate) });
  } catch (err) {
    console.error("getMyCertificates error:", err);
    return res.status(500).json({ error: "Unable to fetch your certificates" });
  }
}

export async function verifyCertificate(req, res) {
  try {
    const verificationCode = String(req.params?.verificationCode || "").trim();
    if (!verificationCode) {
      return res.status(400).json({ error: "verificationCode is required" });
    }

    const certificate = await Certificate.findOne({
      verificationCode,
      status: "issued",
    })
      .populate("userId", "name email")
      .populate("eventId", "title")
      .populate("templateId", "name")
      .lean();

    if (!certificate) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    return res.json({
      verified: true,
      certificate: serialCertificate(certificate),
    });
  } catch (err) {
    console.error("verifyCertificate error:", err);
    return res.status(500).json({ error: "Unable to verify certificate" });
  }
}
