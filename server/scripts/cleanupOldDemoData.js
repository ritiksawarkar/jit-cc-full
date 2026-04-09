import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import EventAttendance from "../models/EventAttendance.js";
import ProblemSelection from "../models/ProblemSelection.js";
import Submission from "../models/Submission.js";
import Certificate from "../models/Certificate.js";
import PrizeAllocation from "../models/PrizeAllocation.js";
import AdminAuditLog from "../models/AdminAuditLog.js";

const OLD_DEMO_EMAILS = [
  "demo.admin@jit.local",
  "student.one@jit.local",
  "student.two@jit.local",
  "student.three@jit.local",
  "student.four@jit.local",
];

async function cleanupOldDemoData() {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  console.log("Starting cleanup of old demo data...\n");

  // Step 1: Find old demo users
  console.log("Step 1: Finding old demo users...");
  const oldDemoUsers = await User.find({ email: { $in: OLD_DEMO_EMAILS } });
  console.log(`Found ${oldDemoUsers.length} old demo users`);
  for (const user of oldDemoUsers) {
    console.log(`- ${user.email} (${user.name})`);
  }

  if (oldDemoUsers.length === 0) {
    console.log("\n✅ No old demo users found. Cleanup complete!");
    await mongoose.disconnect();
    return;
  }

  const oldDemoUserIds = oldDemoUsers.map((u) => u._id);

  // Step 2: Delete related data in order
  console.log("\nStep 2: Deleting related data...");

  // Delete EventAttendance
  console.log("\n  - Deleting EventAttendance records...");
  const deletedAttendance = await EventAttendance.deleteMany({
    userId: { $in: oldDemoUserIds },
  });
  console.log(`    Deleted: ${deletedAttendance.deletedCount} EventAttendance records`);

  // Delete ProblemSelection
  console.log("  - Deleting ProblemSelection records...");
  const deletedSelections = await ProblemSelection.deleteMany({
    userId: { $in: oldDemoUserIds },
  });
  console.log(`    Deleted: ${deletedSelections.deletedCount} ProblemSelection records`);

  // Delete Submission
  console.log("  - Deleting Submission records...");
  const deletedSubmissions = await Submission.deleteMany({
    userId: { $in: oldDemoUserIds },
  });
  console.log(`    Deleted: ${deletedSubmissions.deletedCount} Submission records`);

  // Delete Certificate
  console.log("  - Deleting Certificate records...");
  const deletedCertificates = await Certificate.deleteMany({
    userId: { $in: oldDemoUserIds },
  });
  console.log(`    Deleted: ${deletedCertificates.deletedCount} Certificate records`);

  // Delete PrizeAllocation
  console.log("  - Deleting PrizeAllocation records...");
  const deletedAllocations = await PrizeAllocation.deleteMany({
    userId: { $in: oldDemoUserIds },
  });
  console.log(`    Deleted: ${deletedAllocations.deletedCount} PrizeAllocation records`);

  // Delete AdminAuditLog
  console.log("  - Deleting AdminAuditLog records...");
  const deletedAuditLogs = await AdminAuditLog.deleteMany({
    adminId: { $in: oldDemoUserIds },
  });
  console.log(`    Deleted: ${deletedAuditLogs.deletedCount} AdminAuditLog records`);

  // Step 3: Delete old demo users
  console.log("\nStep 3: Deleting old demo user accounts...");
  const deletedUsers = await User.deleteMany({
    email: { $in: OLD_DEMO_EMAILS },
  });
  console.log(`Deleted: ${deletedUsers.deletedCount} user accounts`);

  console.log("\n✅ Cleanup complete!");
  console.log("\nSummary:");
  console.log(`- User accounts deleted: ${deletedUsers.deletedCount}`);
  console.log(`- EventAttendance records deleted: ${deletedAttendance.deletedCount}`);
  console.log(`- ProblemSelection records deleted: ${deletedSelections.deletedCount}`);
  console.log(`- Submission records deleted: ${deletedSubmissions.deletedCount}`);
  console.log(`- Certificate records deleted: ${deletedCertificates.deletedCount}`);
  console.log(`- PrizeAllocation records deleted: ${deletedAllocations.deletedCount}`);
  console.log(`- AdminAuditLog records deleted: ${deletedAuditLogs.deletedCount}`);
  console.log(
    `\nTotal records deleted: ${
      deletedUsers.deletedCount +
      deletedAttendance.deletedCount +
      deletedSelections.deletedCount +
      deletedSubmissions.deletedCount +
      deletedCertificates.deletedCount +
      deletedAllocations.deletedCount +
      deletedAuditLogs.deletedCount
    }`,
  );

  await mongoose.disconnect();
}

cleanupOldDemoData().catch(async (err) => {
  console.error("Cleanup failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
