import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  bulkUpsertEventAttendance,
  createEvent,
  deleteEvent,
  forceStudentPasswordReset,
  getAdminAuditLogs,
  getAdminOverview,
  getEventAttendanceSummary,
  getStudentsForAdmin,
  listEvents,
  setStudentFreezeState,
  upsertEventAttendance,
  updateEvent,
  updateEventStatus,
} from "../controllers/adminController.js";
import {
  archiveProblem,
  bulkImportProblems,
  createProblem,
  updateProblem,
} from "../controllers/problemController.js";
import {
  computeEventResults,
  finalizeEventResults,
  getEventResults,
} from "../controllers/eventResultsController.js";
import {
  allocateEventPrizes,
  archivePrize,
  createPrize,
  listEventPrizeAllocations,
  listEventPrizes,
  markPrizeDelivered,
  updatePrize,
} from "../controllers/prizeController.js";
import {
  getCertificateAssets,
  resetCertificateAssets,
  uploadCertificateAsset,
} from "../controllers/certificateAssetController.js";
import {
  adminUnlockProblemSelection,
  listEventProblemSelections,
} from "../controllers/problemSelectionController.js";
import { requireActiveEventForProblemMutation } from "../middleware/problemLifecycleMiddleware.js";

const router = Router();

// GET /api/admin/overview
router.get("/overview", requireAuth, requireRole("admin"), getAdminOverview);

// GET /api/admin/events?scope=all|current|future|past
router.get("/events", requireAuth, requireRole("admin"), listEvents);

// POST /api/admin/events
router.post("/events", requireAuth, requireRole("admin"), createEvent);

// PUT /api/admin/events/:eventId
router.put("/events/:eventId", requireAuth, requireRole("admin"), updateEvent);

// PATCH /api/admin/events/:eventId/status
router.patch(
  "/events/:eventId/status",
  requireAuth,
  requireRole("admin"),
  updateEventStatus,
);

// DELETE /api/admin/events/:eventId
router.delete(
  "/events/:eventId",
  requireAuth,
  requireRole("admin"),
  deleteEvent,
);

// GET /api/admin/events/attendance/summary
router.get(
  "/events/attendance/summary",
  requireAuth,
  requireRole("admin"),
  getEventAttendanceSummary,
);

// PUT /api/admin/events/:eventId/attendance
router.put(
  "/events/:eventId/attendance",
  requireAuth,
  requireRole("admin"),
  upsertEventAttendance,
);

// POST /api/admin/events/attendance/bulk
router.post(
  "/events/attendance/bulk",
  requireAuth,
  requireRole("admin"),
  bulkUpsertEventAttendance,
);

// GET /api/admin/students
router.get("/students", requireAuth, requireRole("admin"), getStudentsForAdmin);

// PUT /api/admin/students/:userId/freeze
router.put(
  "/students/:userId/freeze",
  requireAuth,
  requireRole("admin"),
  setStudentFreezeState,
);

// POST /api/admin/students/:userId/force-password-reset
router.post(
  "/students/:userId/force-password-reset",
  requireAuth,
  requireRole("admin"),
  forceStudentPasswordReset,
);

// GET /api/admin/audit-logs?limit=50
router.get("/audit-logs", requireAuth, requireRole("admin"), getAdminAuditLogs);

// POST /api/admin/problems
router.post(
  "/problems",
  requireAuth,
  requireRole("admin"),
  requireActiveEventForProblemMutation,
  createProblem,
);

// PUT /api/admin/problems/:problemId
router.put(
  "/problems/:problemId",
  requireAuth,
  requireRole("admin"),
  requireActiveEventForProblemMutation,
  updateProblem,
);

// DELETE /api/admin/problems/:problemId
router.delete(
  "/problems/:problemId",
  requireAuth,
  requireRole("admin"),
  archiveProblem,
);

// POST /api/admin/problems/bulk/import
router.post(
  "/problems/bulk/import",
  requireAuth,
  requireRole("admin"),
  bulkImportProblems,
);

// GET /api/admin/events/:eventId/results
router.get(
  "/events/:eventId/results",
  requireAuth,
  requireRole("admin"),
  getEventResults,
);

// POST /api/admin/events/:eventId/results/compute
router.post(
  "/events/:eventId/results/compute",
  requireAuth,
  requireRole("admin"),
  computeEventResults,
);

// POST /api/admin/events/:eventId/results/finalize
router.post(
  "/events/:eventId/results/finalize",
  requireAuth,
  requireRole("admin"),
  finalizeEventResults,
);

// GET /api/admin/events/:eventId/problem-selections?page=1&limit=20
router.get(
  "/events/:eventId/problem-selections",
  requireAuth,
  requireRole("admin"),
  listEventProblemSelections,
);

// PUT /api/admin/events/:eventId/problem-selections/:userId/unlock
router.put(
  "/events/:eventId/problem-selections/:userId/unlock",
  requireAuth,
  requireRole("admin"),
  adminUnlockProblemSelection,
);

// POST /api/admin/events/:eventId/prizes
router.post(
  "/events/:eventId/prizes",
  requireAuth,
  requireRole("admin"),
  createPrize,
);

// GET /api/admin/events/:eventId/prizes
router.get(
  "/events/:eventId/prizes",
  requireAuth,
  requireRole("admin"),
  listEventPrizes,
);

// PUT /api/admin/prizes/:prizeId
router.put("/prizes/:prizeId", requireAuth, requireRole("admin"), updatePrize);

// DELETE /api/admin/prizes/:prizeId
router.delete(
  "/prizes/:prizeId",
  requireAuth,
  requireRole("admin"),
  archivePrize,
);

// POST /api/admin/events/:eventId/prizes/allocate
router.post(
  "/events/:eventId/prizes/allocate",
  requireAuth,
  requireRole("admin"),
  allocateEventPrizes,
);

// GET /api/admin/events/:eventId/prizes/allocations
router.get(
  "/events/:eventId/prizes/allocations",
  requireAuth,
  requireRole("admin"),
  listEventPrizeAllocations,
);

// POST /api/admin/prize-allocations/:allocationId/deliver
router.post(
  "/prize-allocations/:allocationId/deliver",
  requireAuth,
  requireRole("admin"),
  markPrizeDelivered,
);

// GET /api/admin/certificate-assets
router.get(
  "/certificate-assets",
  requireAuth,
  requireRole("admin"),
  getCertificateAssets,
);

// PUT /api/admin/certificate-assets/:key
router.put(
  "/certificate-assets/:key",
  requireAuth,
  requireRole("admin"),
  uploadCertificateAsset,
);

// POST /api/admin/certificate-assets/reset
router.post(
  "/certificate-assets/reset",
  requireAuth,
  requireRole("admin"),
  resetCertificateAssets,
);

export default router;
