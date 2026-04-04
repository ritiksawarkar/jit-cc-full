import "dotenv/config";
import mongoose from "mongoose";
import Problem from "../models/Problem.js";

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    dryRun: !flags.has("--commit"),
    verbose: flags.has("--verbose"),
  };
}

function normalizeTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function compareKeepOrder(left, right) {
  const leftTime = new Date(left.createdAt || 0).getTime();
  const rightTime = new Date(right.createdAt || 0).getTime();

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return String(left._id).localeCompare(String(right._id));
}

async function main() {
  const { dryRun, verbose } = parseArgs(process.argv);

  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const duplicateGroups = await Problem.aggregate([
    {
      $match: {
        eventId: { $type: "objectId" },
        title: { $type: "string", $ne: "" },
      },
    },
    {
      $project: {
        eventId: 1,
        title: 1,
        createdAt: 1,
        normalizedTitle: { $toLower: { $trim: { input: "$title" } } },
      },
    },
    {
      $group: {
        _id: {
          eventId: "$eventId",
          normalizedTitle: "$normalizedTitle",
        },
        problems: {
          $push: {
            _id: "$_id",
            title: "$title",
            createdAt: "$createdAt",
          },
        },
        count: { $sum: 1 },
      },
    },
    {
      $match: {
        count: { $gt: 1 },
      },
    },
    {
      $sort: {
        count: -1,
      },
    },
  ]);

  const duplicateIds = [];
  const report = {
    duplicateGroups: duplicateGroups.length,
    duplicateDocuments: 0,
    removedDocuments: 0,
  };

  for (const group of duplicateGroups) {
    const sortedProblems = [...group.problems].sort(compareKeepOrder);
    const keep = sortedProblems[0];
    const remove = sortedProblems.slice(1);

    duplicateIds.push(...remove.map((problem) => problem._id));
    report.duplicateDocuments += remove.length;

    if (verbose) {
      console.log(
        `[duplicate] event=${group._id.eventId} title="${normalizeTitle(group._id.normalizedTitle)}" keep=${keep._id} remove=${remove.map((problem) => problem._id).join(", ")}`,
      );
    }
  }

  console.log("Problem title dedupe report:", JSON.stringify(report, null, 2));

  if (dryRun) {
    console.log(
      "Dry run only. Re-run with --commit to remove duplicate problem rows.",
    );
    await mongoose.disconnect();
    return;
  }

  if (!duplicateIds.length) {
    console.log("No duplicate problem titles found.");
    await mongoose.disconnect();
    return;
  }

  const result = await Problem.deleteMany({ _id: { $in: duplicateIds } });
  report.removedDocuments = result.deletedCount || 0;

  console.log("Duplicate cleanup applied:", {
    removedDocuments: report.removedDocuments,
  });

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Problem title dedupe failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failures
  }
  process.exit(1);
});
