import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  createCertificateTemplate,
  getMyCertificates,
  issueEventCertificates,
  listCertificateTemplates,
  listEventCertificates,
  updateCertificateTemplate,
  verifyCertificate,
} from "../controllers/certificateController.js";
import { getCertificateAssets } from "../controllers/certificateAssetController.js";

const router = Router();

router.get("/my", requireAuth, getMyCertificates);
router.get("/verify/:verificationCode", verifyCertificate);
router.get("/assets", getCertificateAssets);

router.post(
  "/admin/events/:eventId/templates",
  requireAuth,
  requireRole("admin"),
  createCertificateTemplate,
);

router.get(
  "/admin/events/:eventId/templates",
  requireAuth,
  requireRole("admin"),
  listCertificateTemplates,
);

router.put(
  "/admin/templates/:templateId",
  requireAuth,
  requireRole("admin"),
  updateCertificateTemplate,
);

router.post(
  "/admin/events/:eventId/issue",
  requireAuth,
  requireRole("admin"),
  issueEventCertificates,
);

router.get(
  "/admin/events/:eventId",
  requireAuth,
  requireRole("admin"),
  listEventCertificates,
);

export default router;
