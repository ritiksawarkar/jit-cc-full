import dotenv from "dotenv";
import mongoose from "mongoose";
import Problem from "../models/Problem.js";
import connectDB from "../config/db.js";

dotenv.config();

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    dryRun: !flags.has("--commit"),
    verbose: flags.has("--verbose"),
  };
}

function pickEventId(problem) {
  if (
    problem?.eventId &&
    mongoose.Types.ObjectId.isValid(String(problem.eventId))
  ) {
    return String(problem.eventId);
  }

  const legacyIds = Array.isArray(problem?.eventIds) ? problem.eventIds : [];
  const firstValid = legacyIds.find((value) =>
    mongoose.Types.ObjectId.isValid(String(value || "")),
  );

  return firstValid ? String(firstValid) : "";
}

async function main() {
  const { dryRun, verbose } = parseArgs(process.argv);

  await connectDB();

  const legacyProblems = await Problem.find({
    $or: [
      { eventId: { $exists: false } },
      { eventId: null },
      { eventIds: { $exists: true, $type: "array", $ne: [] } },
    ],
  })
    .select("title eventId eventIds")
    .lean();

  const ops = [];
  const report = {
    scanned: legacyProblems.length,
    readyToUpdate: 0,
    alreadyStrict: 0,
    missingEventReference: 0,
    ambiguousLegacyRecords: 0,
  };

  for (const problem of legacyProblems) {
    const legacyIds = Array.isArray(problem.eventIds)
      ? problem.eventIds.filter(Boolean)
      : [];
    const nextEventId = pickEventId(problem);

    if (problem.eventId && !legacyIds.length) {
      report.alreadyStrict += 1;
      continue;
    }

    if (!nextEventId) {
      report.missingEventReference += 1;
      if (verbose) {
        console.log(
          `[skip] ${problem.title || problem._id}: no valid event reference found`,
        );
      }
      continue;
    }

    if (legacyIds.length > 1) {
      report.ambiguousLegacyRecords += 1;
      if (verbose) {
        console.log(
          `[warn] ${problem.title || problem._id}: multiple legacy eventIds found, using first valid id ${nextEventId}`,
        );
      }
    }

    report.readyToUpdate += 1;
    ops.push({
      updateOne: {
        filter: { _id: problem._id },
        update: {
          $set: { eventId: new mongoose.Types.ObjectId(nextEventId) },
          $unset: { eventIds: "" },
        },
      },
    });
  }

  console.log(
    "Problem-event migration report:",
    JSON.stringify(report, null, 2),
  );

  if (dryRun) {
    console.log("Dry run only. Re-run with --commit to apply updates.");
    await mongoose.disconnect();
    return;
  }

  if (!ops.length) {
    console.log("No updates required.");
    await mongoose.disconnect();
    return;
  }

  const result = await Problem.bulkWrite(ops, { ordered: false });
  console.log("Migration applied:", {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    upsertedCount: result.upsertedCount,
  });

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Problem-event migration failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failures
  }
  process.exit(1);
});
