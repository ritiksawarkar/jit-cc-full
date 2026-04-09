import "dotenv/config";
import mongoose from "mongoose";
import Event from "../models/Event.js";
import EventAttendance from "../models/EventAttendance.js";
import EventLeaderboard from "../models/EventLeaderboard.js";
import Prize from "../models/Prize.js";
import PrizeAllocation from "../models/PrizeAllocation.js";
import Problem from "../models/Problem.js";
import ProblemSelection from "../models/ProblemSelection.js";
import Submission from "../models/Submission.js";
import User from "../models/User.js";
import Certificate from "../models/Certificate.js";
import CertificateTemplate from "../models/CertificateTemplate.js";
import AdminAuditLog from "../models/AdminAuditLog.js";

const DEMO_PASSWORD = "Demo@12345";
const FUTURE_EVENT_MARKER = "Seeded future event for admin overview timeline.";

const DEMO_USERS = [
  {
    name: "Rajesh Sharma",
    email: "rajesh.sharma@jit.local",
    role: "admin",
  },
  {
    name: "Priya Verma",
    email: "priya.verma@jit.local",
    role: "student",
  },
  {
    name: "Arjun Gupta",
    email: "arjun.gupta@jit.local",
    role: "student",
  },
  {
    name: "Neha Singh",
    email: "neha.singh@jit.local",
    role: "student",
  },
  {
    name: "Aditya Patel",
    email: "aditya.patel@jit.local",
    role: "student",
  },
];

function randomSuffix(length = 6) {
  return Math.random()
    .toString(36)
    .slice(2, 2 + length)
    .toUpperCase();
}

function getFutureSeedCount() {
  const raw = Number(process.env.SEED_FUTURE_EVENTS_COUNT || 2);
  if (!Number.isFinite(raw)) {
    return 2;
  }
  return Math.max(0, Math.min(5, Math.floor(raw)));
}

function getSeedPrizeConfigs() {
  return [
    {
      title: "Winner Cash Prize",
      description: "SEED_PRIZE_DATA :: Rank 1 cash reward",
      kind: "cash",
      rankFrom: 1,
      rankTo: 1,
      amount: 5000,
      currency: "INR",
      maxRecipients: 1,
      isActive: true,
    },
    {
      title: "Runner-Up Voucher",
      description: "SEED_PRIZE_DATA :: Rank 2 voucher",
      kind: "voucher",
      rankFrom: 2,
      rankTo: 2,
      amount: 2500,
      currency: "INR",
      maxRecipients: 1,
      isActive: true,
    },
    {
      title: "Top 3 Gift Hamper",
      description: "SEED_PRIZE_DATA :: Rank 3 custom gift hamper",
      kind: "gift",
      rankFrom: 3,
      rankTo: 3,
      amount: 1500,
      currency: "INR",
      maxRecipients: 1,
      isActive: true,
    },
  ];
}

function getSeedProblems(eventId) {
  return [
    {
      title: "Array Sprint: Pair Sum",
      statement:
        "Given an array of integers and a target T, print any pair of indices whose values add up to T.",
      sampleInput: "5 9\n2 7 11 15 1",
      sampleOutput: "1 2",
      expectedOutput: "1 2",
      difficulty: "easy",
      tags: ["array", "hash-map", "two-sum"],
      eventId,
      isCompetitive: true,
      totalPoints: 60,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "basic_pair",
          input: "5 9\n2 7 11 15 1",
          expectedOutput: "1 2",
          isHidden: false,
          order: 0,
          weight: 1,
          timeLimitSeconds: 2,
          memoryLimitKb: 131072,
        },
      ],
    },
    {
      title: "String Sprint: First Unique Character",
      statement:
        "Given a lowercase string S, print the first character that appears exactly once.",
      sampleInput: "swiss",
      sampleOutput: "w",
      expectedOutput: "w",
      difficulty: "easy",
      tags: ["string", "frequency", "hashing"],
      eventId,
      isCompetitive: true,
      totalPoints: 70,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "unique_character",
          input: "swiss",
          expectedOutput: "w",
          isHidden: false,
          order: 0,
          weight: 1,
          timeLimitSeconds: 2,
          memoryLimitKb: 131072,
        },
      ],
    },
    {
      title: "Graph Sprint: Minimum Grid Steps",
      statement:
        "Given a grid of open cells and walls, print the shortest distance from the top-left cell to the bottom-right cell.",
      sampleInput: "3 4\n....\n.#..\n...#",
      sampleOutput: "5",
      expectedOutput: "5",
      difficulty: "medium",
      tags: ["graph", "bfs", "grid"],
      eventId,
      isCompetitive: true,
      totalPoints: 90,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "grid_path",
          input: "3 4\n....\n.#..\n...#",
          expectedOutput: "5",
          isHidden: false,
          order: 0,
          weight: 1,
          timeLimitSeconds: 2,
          memoryLimitKb: 131072,
        },
      ],
    },
    {
      title: "DP Sprint: Stair Climb Count",
      statement:
        "You can climb 1, 2, or 3 steps at a time. Given N, print the number of distinct ways to reach step N.",
      sampleInput: "5",
      sampleOutput: "13",
      expectedOutput: "13",
      difficulty: "medium",
      tags: ["dp", "fibonacci", "recurrence"],
      eventId,
      isCompetitive: true,
      totalPoints: 80,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "stairs_5",
          input: "5",
          expectedOutput: "13",
          isHidden: false,
          order: 0,
          weight: 1,
          timeLimitSeconds: 2,
          memoryLimitKb: 131072,
        },
      ],
    },
  ];
}

async function createSeedEvent() {
  const suffix = randomSuffix();
  const indianEventNames = [
    "CodeJourney India",
    "DevChallenge Bharat",
    "Algorithm Arena",
    "TechSprint India",
    "CodeMaster Challenge",
  ];
  const randomEventName =
    indianEventNames[Math.floor(Math.random() * indianEventNames.length)];
  const title = `${randomEventName} ${suffix}`;
  const now = new Date();
  const startAt = new Date(now.getTime() - 30 * 60 * 1000);
  const endAt = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  return Event.create({
    title,
    description:
      "National coding sprint featuring algorithmic problems and real-time leaderboard.",
    startAt,
    endAt,
  });
}

async function resolveSeedEvent() {
  const eventIdFromEnv = String(process.env.SEED_EVENT_ID || "").trim();
  if (!eventIdFromEnv) {
    return createSeedEvent();
  }

  if (!mongoose.Types.ObjectId.isValid(eventIdFromEnv)) {
    throw new Error("SEED_EVENT_ID is not a valid ObjectId");
  }

  const event = await Event.findById(eventIdFromEnv);
  if (!event) {
    throw new Error("SEED_EVENT_ID does not match an existing event");
  }

  return event;
}

async function ensureFutureSeedEvents() {
  const targetCount = getFutureSeedCount();
  const now = new Date();

  if (targetCount === 0) {
    return { targetCount, created: [], current: [] };
  }

  const existingFutureSeeded = await Event.find({
    description: FUTURE_EVENT_MARKER,
    startAt: { $gt: now },
  })
    .sort({ startAt: 1 })
    .lean();

  const created = [];
  const toCreate = Math.max(0, targetCount - existingFutureSeeded.length);

  const indianEventNames = [
    "CodeJourney India",
    "DevChallenge Bharat",
    "Algorithm Arena",
    "TechSprint India",
    "CodeMaster Challenge",
    "Algorithm Championship",
    "Data Structures Sprint",
  ];

  for (let index = 0; index < toCreate; index += 1) {
    const dayOffset = 1 + index + Math.floor(Math.random() * 3);
    const startAt = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

    const randomEventName =
      indianEventNames[Math.floor(Math.random() * indianEventNames.length)];

    const futureEvent = await Event.create({
      title: `${randomEventName} ${randomSuffix(5)}`,
      description: FUTURE_EVENT_MARKER,
      startAt,
      endAt,
    });
    created.push(futureEvent);
  }

  const current = await Event.find({ startAt: { $gt: now } })
    .sort({ startAt: 1 })
    .lean();

  return {
    targetCount,
    created,
    current,
  };
}

async function upsertProblems(event) {
  const seedProblems = getSeedProblems(event._id);
  const savedProblems = [];

  for (const problemData of seedProblems) {
    const existing = await Problem.findOne({
      eventId: event._id,
      title: problemData.title,
    });

    if (existing) {
      Object.assign(existing, problemData);
      await existing.save();
      savedProblems.push(existing);
      continue;
    }

    const created = await Problem.create(problemData);
    savedProblems.push(created);
  }

  return savedProblems;
}

async function upsertDemoUsers() {
  const savedUsers = [];

  for (const userData of DEMO_USERS) {
    const email = String(userData.email).trim().toLowerCase();
    let user = await User.findOne({ email }).select("+password");

    if (!user) {
      user = await User.create({
        name: userData.name,
        email,
        password: DEMO_PASSWORD,
        role: userData.role,
      });
      savedUsers.push({ user, action: "created" });
      continue;
    }

    user.name = userData.name;
    user.password = DEMO_PASSWORD;
    user.role = userData.role;
    user.isFrozen = false;
    user.frozenReason = "";
    user.frozenAt = null;
    user.mustResetPassword = false;
    user.passwordResetForcedAt = null;
    await user.save();
    savedUsers.push({ user, action: "updated" });
  }

  return savedUsers;
}

async function autoJoinStudentsToEvent(event, users) {
  const studentUsers = users
    .filter((item) => item?.user?.role === "student")
    .map((item) => item.user);

  const attendanceResults = [];

  for (const student of studentUsers) {
    const existing = await EventAttendance.findOne({
      eventId: event._id,
      userId: student._id,
    })
      .select("_id")
      .lean();

    if (existing) {
      attendanceResults.push({ user: student, action: "already-joined" });
      continue;
    }

    await EventAttendance.create({
      eventId: event._id,
      userId: student._id,
      status: "registered",
    });
    attendanceResults.push({ user: student, action: "joined" });
  }

  return attendanceResults;
}

async function autoLockSelectionsForStudents(event, users, problems) {
  const studentUsers = users
    .filter((item) => item?.user?.role === "student")
    .map((item) => item.user);

  if (problems.length === 0) {
    return [];
  }

  const lockResults = [];

  for (let index = 0; index < studentUsers.length; index += 1) {
    const student = studentUsers[index];
    const assignedProblem = problems[index % problems.length];

    const existing = await ProblemSelection.findOne({
      eventId: event._id,
      userId: student._id,
    });

    if (!existing) {
      await ProblemSelection.create({
        eventId: event._id,
        userId: student._id,
        problemId: assignedProblem._id,
        isLocked: true,
        lockedAt: new Date(),
        unlockedAt: null,
        unlockedBy: null,
        reason: "Auto-locked by seed script",
      });
      lockResults.push({
        user: student,
        problem: assignedProblem,
        action: "locked",
      });
      continue;
    }

    existing.problemId = assignedProblem._id;
    existing.isLocked = true;
    existing.lockedAt = new Date();
    existing.unlockedAt = null;
    existing.unlockedBy = null;
    existing.reason = "Auto-locked by seed script";
    await existing.save();

    lockResults.push({
      user: student,
      problem: assignedProblem,
      action: "re-locked",
    });
  }

  return lockResults;
}

function buildMockSubmissionPayload(event, user, problem, index) {
  const isAccepted = index % 2 === 0;
  const totalPoints = Number(problem?.totalPoints || 100);
  const earnedPoints = isAccepted ? totalPoints : Math.max(5, totalPoints / 2);
  const percentage = Math.round((earnedPoints / totalPoints) * 10000) / 100;

  const seededSource = [
    "// SEED_MOCK_SUBMISSION",
    `// user: ${user.email}`,
    `// problem: ${problem.title}`,
    "#include <iostream>",
    "int main() {",
    `  std::cout << \"${isAccepted ? problem.expectedOutput : "0"}\";`,
    "  return 0;",
    "}",
  ].join("\n");

  return {
    eventId: event._id,
    userId: user._id,
    problemId: problem._id,
    language: "cpp",
    sourceCode: seededSource,
    input: String(problem.sampleInput || ""),
    output: String(isAccepted ? problem.expectedOutput : "0"),
    expectedOutput: String(problem.expectedOutput || ""),
    status: isAccepted ? "Accepted" : "Wrong Answer",
    executionTime: isAccepted ? 0.14 : 0.32,
    memory: isAccepted ? 13312 : 14336,
    score: {
      total: totalPoints,
      earned: earnedPoints,
      percentage,
      passedCount: isAccepted ? 1 : 0,
      totalCount: 1,
    },
    verdicts: [
      {
        index: 0,
        name: "seed_case",
        isHidden: false,
        input: String(problem.sampleInput || ""),
        expectedOutput: String(problem.expectedOutput || ""),
        actualOutput: String(isAccepted ? problem.expectedOutput : "0"),
        status: isAccepted ? "Accepted" : "Wrong Answer",
        statusId: isAccepted ? 3 : 4,
        executionTime: isAccepted ? 0.14 : 0.32,
        memory: isAccepted ? 13312 : 14336,
        weight: 1,
        earnedWeight: isAccepted ? 1 : 0,
        stderr: "",
        compileOutput: "",
      },
    ],
    compileOutput: "",
    stderrRaw: "",
    judge0StatusId: isAccepted ? 3 : 4,
    evaluatedAt: new Date(Date.now() - index * 60 * 1000),
    problemSnapshot: {
      title: String(problem.title || ""),
      version: Number(problem.version || 1),
      isCompetitive: Boolean(problem.isCompetitive !== false),
    },
  };
}

async function seedMockSubmissions(event, lockResults) {
  const results = [];

  for (let index = 0; index < lockResults.length; index += 1) {
    const item = lockResults[index];
    const payload = buildMockSubmissionPayload(
      event,
      item.user,
      item.problem,
      index,
    );

    const existing = await Submission.findOne({
      eventId: event._id,
      userId: item.user._id,
      problemId: item.problem._id,
      sourceCode: { $regex: "SEED_MOCK_SUBMISSION" },
    });

    if (!existing) {
      const created = await Submission.create(payload);
      results.push({
        action: "created",
        user: item.user,
        problem: item.problem,
        status: created.status,
        score: Number(created?.score?.earned || 0),
      });
      continue;
    }

    Object.assign(existing, payload);
    await existing.save();
    results.push({
      action: "updated",
      user: item.user,
      problem: item.problem,
      status: existing.status,
      score: Number(existing?.score?.earned || 0),
    });
  }

  return results;
}

function rankEntries(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (b.passedProblems !== a.passedProblems) {
      return b.passedProblems - a.passedProblems;
    }

    const aTime = a.lastSubmissionTime
      ? new Date(a.lastSubmissionTime).getTime()
      : Number.MAX_SAFE_INTEGER;
    const bTime = b.lastSubmissionTime
      ? new Date(b.lastSubmissionTime).getTime()
      : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) {
      return aTime - bTime;
    }

    return a.totalAttempts - b.totalAttempts;
  });

  return sorted.map((entry, index) => {
    const rank = index + 1;
    return {
      ...entry,
      rank,
      merit:
        rank === 1
          ? "gold"
          : rank === 2
            ? "silver"
            : rank === 3
              ? "bronze"
              : "none",
      tiebreaker: {
        score: entry.totalScore,
        passedProblems: entry.passedProblems,
        lastSubmissionTime: entry.lastSubmissionTime,
        attempts: entry.totalAttempts,
      },
    };
  });
}

async function upsertDraftLeaderboard(event) {
  const [submissions, users, problems] = await Promise.all([
    Submission.find({ eventId: event._id }).lean(),
    User.find({}).select("_id name email").lean(),
    Problem.find({ eventId: event._id, isCompetitive: true, isActive: true })
      .select("_id totalPoints passingThreshold")
      .lean(),
  ]);

  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const problemMap = new Map(
    problems.map((problem) => [String(problem._id), problem]),
  );

  const bestByUserProblem = new Map();
  for (const submission of submissions) {
    const userId = String(submission.userId || "");
    const problemId = String(submission.problemId || "");
    if (!userId || !problemId) {
      continue;
    }

    const key = `${userId}::${problemId}`;
    const current = bestByUserProblem.get(key);
    if (!current) {
      bestByUserProblem.set(key, submission);
      continue;
    }

    const currentScore = Number(current?.score?.earned || 0);
    const nextScore = Number(submission?.score?.earned || 0);
    if (nextScore > currentScore) {
      bestByUserProblem.set(key, submission);
      continue;
    }

    if (nextScore === currentScore) {
      const currentTime = new Date(current.createdAt || 0).getTime();
      const nextTime = new Date(submission.createdAt || 0).getTime();
      if (nextTime < currentTime) {
        bestByUserProblem.set(key, submission);
      }
    }
  }

  const perUser = new Map();
  for (const [key, submission] of bestByUserProblem.entries()) {
    const [userId, problemId] = key.split("::");
    const problem = problemMap.get(problemId);
    const possible = Number(
      problem?.totalPoints || submission?.score?.total || 100,
    );
    const earned = Number(submission?.score?.earned || 0);

    if (!perUser.has(userId)) {
      perUser.set(userId, {
        userId,
        totalScore: 0,
        totalPossibleScore: 0,
        passedProblems: 0,
        totalAttempts: 0,
        lastSubmissionTime: null,
      });
    }

    const row = perUser.get(userId);
    row.totalScore += earned;
    row.totalPossibleScore += possible;

    const threshold = Number(problem?.passingThreshold ?? 100);
    const percentage = Number(submission?.score?.percentage || 0);
    if (
      percentage >= threshold ||
      String(submission?.status || "") === "Accepted"
    ) {
      row.passedProblems += 1;
    }

    row.totalAttempts += 1;
    const createdAt = submission?.createdAt
      ? new Date(submission.createdAt)
      : null;
    if (
      createdAt &&
      (!row.lastSubmissionTime || createdAt > row.lastSubmissionTime)
    ) {
      row.lastSubmissionTime = createdAt;
    }
  }

  const entries = Array.from(perUser.values()).map((row) => {
    const user = userMap.get(String(row.userId)) || {};
    const percentage =
      row.totalPossibleScore > 0
        ? Math.round((row.totalScore / row.totalPossibleScore) * 10000) / 100
        : 0;

    return {
      userId: row.userId,
      userName: String(user.name || "Unknown User"),
      userEmail: String(user.email || ""),
      totalScore: Math.round(row.totalScore * 100) / 100,
      totalPossibleScore: Math.round(row.totalPossibleScore * 100) / 100,
      percentage,
      passedProblems: row.passedProblems,
      totalAttempts: row.totalAttempts,
      lastSubmissionTime: row.lastSubmissionTime,
    };
  });

  const rankedEntries = rankEntries(entries);
  const leaderboard = await EventLeaderboard.findOneAndUpdate(
    { eventId: event._id },
    {
      eventId: event._id,
      entries: rankedEntries,
      stats: {
        totalParticipants: rankedEntries.length,
        totalSubmissions: submissions.length,
        totalProblems: problems.length,
      },
      computedAt: new Date(),
      isFinal: false,
      isPublished: false,
      finalizedAt: null,
      publishedAt: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return leaderboard;
}

async function upsertSeedPrizes(event) {
  const configs = getSeedPrizeConfigs();
  const results = [];

  for (const config of configs) {
    const existing = await Prize.findOne({
      eventId: event._id,
      title: config.title,
      description: { $regex: "SEED_PRIZE_DATA" },
    });

    if (!existing) {
      const created = await Prize.create({
        ...config,
        eventId: event._id,
      });
      results.push({ action: "created", prize: created });
      continue;
    }

    Object.assign(existing, config, { eventId: event._id });
    await existing.save();
    results.push({ action: "updated", prize: existing });
  }

  return results;
}

async function upsertPrizeAllocationsFromLeaderboard(
  event,
  leaderboard,
  prizeResults,
) {
  const prizes = prizeResults.map((item) => item.prize);
  const leaderboardEntries = Array.isArray(leaderboard?.entries)
    ? leaderboard.entries
    : [];

  const allocationResults = [];

  for (let prizeIndex = 0; prizeIndex < prizes.length; prizeIndex += 1) {
    const prize = prizes[prizeIndex];
    const eligible = leaderboardEntries
      .filter(
        (entry) =>
          Number(entry.rank) >= Number(prize.rankFrom) &&
          Number(entry.rank) <= Number(prize.rankTo),
      )
      .slice(0, Math.max(1, Number(prize.maxRecipients || 1)));

    for (let winnerIndex = 0; winnerIndex < eligible.length; winnerIndex += 1) {
      const winner = eligible[winnerIndex];
      const allocationSeedIndex = prizeIndex + winnerIndex;
      const seededStatus =
        allocationSeedIndex % 3 === 0
          ? "allocated"
          : allocationSeedIndex % 3 === 1
            ? "claimed"
            : "delivered";

      const claimedAt =
        seededStatus === "claimed" || seededStatus === "delivered"
          ? new Date(Date.now() - 2 * 60 * 60 * 1000)
          : null;
      const deliveredAt =
        seededStatus === "delivered"
          ? new Date(Date.now() - 60 * 60 * 1000)
          : null;

      const payload = {
        eventId: event._id,
        leaderboardSnapshotId: leaderboard._id,
        prizeId: prize._id,
        userId: winner.userId,
        rank: Number(winner.rank || 0),
        status: seededStatus,
        claimDetails:
          seededStatus === "claimed" || seededStatus === "delivered"
            ? "SEED_CLAIM_DETAILS :: UPI / bank details submitted"
            : "",
        claimedAt,
        deliveredAt,
        deliveredBy: null,
        note:
          seededStatus === "delivered"
            ? "SEED_DELIVERED_NOTE :: Reward processed"
            : "",
      };

      const existing = await PrizeAllocation.findOne({
        eventId: event._id,
        prizeId: prize._id,
        userId: winner.userId,
      });

      if (!existing) {
        const created = await PrizeAllocation.create(payload);
        allocationResults.push({
          action: "created",
          allocation: created,
          prize,
          winner,
        });
        continue;
      }

      Object.assign(existing, payload);
      await existing.save();
      allocationResults.push({
        action: "updated",
        allocation: existing,
        prize,
        winner,
      });
    }
  }

  return allocationResults;
}

async function seedCertificateTemplate(event) {
  const templateName = "Achievement Certificate - {{eventTitle}} {{rank}}";
  const templateText = `
    ═══════════════════════════════════════════════════════════════════════════
    
                              CERTIFICATE OF EXCELLENCE
    
    ═══════════════════════════════════════════════════════════════════════════
    
    This is to certify that
    
    {{userName}}
    
    has demonstrated exceptional skills and competitive spirit by securing
    
    RANK {{rank}}
    
    in {{eventTitle}}
    
    ───────────────────────────────────────────────────────────────────────────
    
    Total Score Achieved: {{totalScore}} Points
    Performance Level: {{merit}}
    Date of Achievement: {{issuedAt}}
    Certificate No: {{certificateNo}}
    
    ───────────────────────────────────────────────────────────────────────────
    
    This certificate recognizes excellence in problem-solving and algorithmic
    thinking. The holder has demonstrated proficiency in competitive programming
    and is entitled to claim this achievement.
    
    ═══════════════════════════════════════════════════════════════════════════
  `.trim();

  const existing = await CertificateTemplate.findOne({
    eventId: event._id,
    name: templateName,
  });

  if (!existing) {
    const created = await CertificateTemplate.create({
      eventId: event._id,
      name: templateName,
      templateText,
      isDefault: true,
      isActive: true,
      metadata: {
        seedMarker: "SEED_CERTIFICATE_TEMPLATE",
      },
    });
    return { action: "created", template: created };
  }

  Object.assign(existing, {
    templateText,
    isDefault: true,
    isActive: true,
    metadata: {
      seedMarker: "SEED_CERTIFICATE_TEMPLATE",
    },
  });
  await existing.save();
  return { action: "updated", template: existing };
}

async function seedCertificates(event, leaderboard, templateResult) {
  const template = templateResult.template;
  const leaderboardEntries = Array.isArray(leaderboard?.entries)
    ? leaderboard.entries
    : [];

  const certificateResults = [];

  for (let index = 0; index < leaderboardEntries.length; index += 1) {
    const entry = leaderboardEntries[index];
    const user = await User.findById(entry.userId).lean();

    if (!user) continue;

    // Generate unique certificate number and verification code
    const certificateNo = `CERT-${event._id.toString().slice(-8).toUpperCase()}-${String(entry.rank).padStart(3, "0")}-${randomSuffix(4)}`;
    const verificationCode = `VER-${randomSuffix(8)}`;

    const existing = await Certificate.findOne({
      eventId: event._id,
      userId: entry.userId,
    });

    const payload = {
      eventId: event._id,
      userId: entry.userId,
      templateId: template._id,
      leaderboardSnapshotId: leaderboard._id,
      certificateNo,
      verificationCode,
      status: "issued",
      issuedAt: new Date(),
      issuedBy: null,
      rank: entry.rank,
      totalScore: entry.totalScore,
      merit: entry.merit || "none",
      payload: {
        userName: user.name,
        eventTitle: event.title,
        rank: entry.rank,
        totalScore: entry.totalScore,
        merit: entry.merit || "none",
        issuedAt: new Date().toISOString().split("T")[0],
        certificateNo,
      },
    };

    if (!existing) {
      const created = await Certificate.create(payload);
      certificateResults.push({
        action: "created",
        certificate: created,
        user,
        entry,
      });
      continue;
    }

    Object.assign(existing, payload);
    await existing.save();
    certificateResults.push({
      action: "updated",
      certificate: existing,
      user,
      entry,
    });
  }

  return certificateResults;
}

async function seedAdminAuditLogs(
  event,
  admin,
  problems,
  users,
  leaderboard,
  prizeResults,
  certificateResults,
) {
  const auditLogs = [];
  const now = new Date();

  // Extract user data properly (users is array of {user, action} objects)
  const usersData = users.map((item) => item.user || item);
  const prizeId =
    prizeResults.length > 0
      ? prizeResults[0].prize?._id?.toString()
      : event._id.toString();
  const prizeTitle =
    prizeResults.length > 0 ? prizeResults[0].prize?.title : "Demo Prize";
  const recipientEmail =
    usersData.length > 0 ? usersData[0].email : "priya.verma@jit.local";
  const firstStudentId =
    usersData.length > 0 ? usersData[0]._id?.toString() : "";

  const AUDIT_ACTIONS = [
    {
      action: "CREATE_EVENT",
      targetType: "Event",
      targetId: event._id.toString(),
      metadata: {
        eventTitle: event.title,
        description: event.description,
        startAt: event.startAt,
        endAt: event.endAt,
        seedMarker: "SEED_AUDIT_LOG",
      },
    },
    {
      action: "CREATE_PROBLEM",
      targetType: "Problem",
      targetId: problems[0]?._id?.toString() || "",
      metadata: {
        problemTitle: problems[0]?.title || "Problem 1",
        difficulty: "medium",
        eventId: event._id.toString(),
        seedMarker: "SEED_AUDIT_LOG",
      },
    },
    {
      action: "CREATE_PROBLEM",
      targetType: "Problem",
      targetId: problems[1]?._id?.toString() || "",
      metadata: {
        problemTitle: problems[1]?.title || "Problem 2",
        difficulty: "hard",
        eventId: event._id.toString(),
        seedMarker: "SEED_AUDIT_LOG",
      },
    },
    {
      action: "UPDATE_EVENT",
      targetType: "Event",
      targetId: event._id.toString(),
      metadata: {
        eventTitle: event.title,
        fields: ["description", "endAt"],
        oldValues: {
          description: "Initial description",
          endAt: new Date(now.getTime() - 60 * 60 * 1000),
        },
        newValues: {
          description: event.description,
          endAt: event.endAt,
        },
        seedMarker: "SEED_AUDIT_LOG",
      },
    },
    {
      action: "APPROVE_PRIZE_ALLOCATION",
      targetType: "PrizeAllocation",
      targetId: prizeId,
      metadata: {
        prizeTitle: prizeTitle,
        recipientEmail: recipientEmail,
        status: "approved",
        approvedAt: new Date(),
        seedMarker: "SEED_AUDIT_LOG",
      },
    },
    {
      action: "FINALIZE_LEADERBOARD",
      targetType: "EventLeaderboard",
      targetId: leaderboard._id.toString(),
      metadata: {
        eventTitle: event.title,
        participantCount: leaderboard?.stats?.totalParticipants || 4,
        isFinal: true,
        seedMarker: "SEED_AUDIT_LOG",
      },
    },
    {
      action: "ISSUE_CERTIFICATES",
      targetType: "Certificate",
      targetId: event._id.toString(),
      metadata: {
        eventTitle: event.title,
        certificateCount: certificateResults.length,
        templateUsed: "Congratulations {{userName}}...",
        seedMarker: "SEED_AUDIT_LOG",
      },
    },
    {
      action: "BULK_FREEZE_STUDENTS",
      targetType: "User",
      targetId: firstStudentId,
      metadata: {
        totalFrozen: 1,
        freezeReason: "Academic integrity violation - Seed demo action",
        unfreezeDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        seedMarker: "SEED_AUDIT_LOG",
      },
    },
    {
      action: "VIEW_LEADERBOARD",
      targetType: "EventLeaderboard",
      targetId: leaderboard._id.toString(),
      metadata: {
        eventTitle: event.title,
        exportedFormat: "PDF",
        seedMarker: "SEED_AUDIT_LOG",
      },
    },
    {
      action: "UPDATE_PROBLEM_STATEMENT",
      targetType: "Problem",
      targetId: problems[2]?._id?.toString() || "",
      metadata: {
        problemTitle: problems[2]?.title || "Problem 3",
        updatedFields: ["description", "constraints"],
        reason: "Clarification added",
        seedMarker: "SEED_AUDIT_LOG",
      },
    },
  ];

  const results = [];

  for (let index = 0; index < AUDIT_ACTIONS.length; index += 1) {
    const auditConfig = AUDIT_ACTIONS[index];

    // Create timestamped entries (staggered by minutes)
    const createdAt = new Date(
      now.getTime() - (AUDIT_ACTIONS.length - index) * 5 * 60 * 1000,
    );

    const existing = await AdminAuditLog.findOne({
      adminId: admin._id,
      action: auditConfig.action,
      targetType: auditConfig.targetType,
      "metadata.seedMarker": "SEED_AUDIT_LOG",
    });

    const payload = {
      adminId: admin._id,
      action: auditConfig.action,
      targetType: auditConfig.targetType,
      targetId: auditConfig.targetId,
      metadata: auditConfig.metadata,
      createdAt,
    };

    if (!existing) {
      const created = await AdminAuditLog.create(payload);
      results.push({ action: "created", log: created });
      continue;
    }

    await AdminAuditLog.findByIdAndUpdate(existing._id, {
      ...payload,
      createdAt,
    });
    results.push({ action: "updated", log: existing });
  }

  return results;
}

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const users = await upsertDemoUsers();
  const futureEvents = await ensureFutureSeedEvents();
  const event = await resolveSeedEvent();
  const problems = await upsertProblems(event);
  const attendances = await autoJoinStudentsToEvent(event, users);
  const lockedSelections = await autoLockSelectionsForStudents(
    event,
    users,
    problems,
  );
  const submissions = await seedMockSubmissions(event, lockedSelections);
  const leaderboard = await upsertDraftLeaderboard(event);
  const prizeResults = await upsertSeedPrizes(event);
  const allocationResults = await upsertPrizeAllocationsFromLeaderboard(
    event,
    leaderboard,
    prizeResults,
  );
  const templateResult = await seedCertificateTemplate(event);
  const certificateResults = await seedCertificates(
    event,
    leaderboard,
    templateResult,
  );

  // Find admin user for audit logs
  const admin = await User.findOne({ email: "rajesh.sharma@jit.local" });
  const auditLogResults = await seedAdminAuditLogs(
    event,
    admin,
    problems,
    users,
    leaderboard,
    prizeResults,
    certificateResults,
  );

  console.log("\nSeed complete");
  console.log(`Demo users processed: ${users.length}`);
  console.log(`Demo login password: ${DEMO_PASSWORD}`);
  console.log("Demo user accounts:");
  for (const item of users) {
    console.log(`- [${item.action}] ${item.user.email} (${item.user.role})`);
  }
  console.log(`Event ID: ${event._id}`);
  console.log(`Event Title: ${event.title}`);
  console.log(`Future events target: ${futureEvents.targetCount}`);
  console.log(`Future events created now: ${futureEvents.created.length}`);
  console.log(`Total future events in DB: ${futureEvents.current.length}`);
  if (futureEvents.created.length > 0) {
    console.log("Newly created future events:");
    for (const item of futureEvents.created) {
      console.log(`- ${item.title} (${new Date(item.startAt).toISOString()})`);
    }
  }
  console.log(`Problems Created/Updated: ${problems.length}`);
  console.log(`Student joins processed: ${attendances.length}`);
  console.log("Event join status:");
  for (const item of attendances) {
    console.log(`- [${item.action}] ${item.user.email}`);
  }
  console.log(`Problem locks processed: ${lockedSelections.length}`);
  console.log("Problem lock status:");
  for (const item of lockedSelections) {
    console.log(
      `- [${item.action}] ${item.user.email} -> ${item.problem.title}`,
    );
  }
  console.log(`Mock submissions processed: ${submissions.length}`);
  console.log("Mock submission status:");
  for (const item of submissions) {
    console.log(
      `- [${item.action}] ${item.user.email} | ${item.status} | score=${item.score}`,
    );
  }
  console.log(
    `Leaderboard status: ${leaderboard?.isFinal ? "Finalized" : "Draft"}`,
  );
  console.log(
    `Leaderboard stats: participants=${leaderboard?.stats?.totalParticipants || 0}, submissions=${leaderboard?.stats?.totalSubmissions || 0}, problems=${leaderboard?.stats?.totalProblems || 0}`,
  );
  console.log(`Prizes processed: ${prizeResults.length}`);
  for (const item of prizeResults) {
    console.log(
      `- [${item.action}] ${item.prize.title} (#${item.prize.rankFrom}-#${item.prize.rankTo})`,
    );
  }
  console.log(`Prize allocations processed: ${allocationResults.length}`);
  for (const item of allocationResults) {
    console.log(
      `- [${item.action}] rank=${item.winner.rank} ${item.winner.userEmail} -> ${item.prize.title} (${item.allocation.status})`,
    );
  }
  console.log(`Certificate template processed: 1`);
  console.log(`- [${templateResult.action}] ${templateResult.template.name}`);
  console.log(`Certificates issued: ${certificateResults.length}`);
  for (const item of certificateResults) {
    console.log(
      `- [${item.action}] rank=${item.entry.rank} ${item.user.email} -> Cert#${item.certificate.certificateNo}`,
    );
  }
  console.log(`Admin audit logs processed: ${auditLogResults.length}`);
  for (const item of auditLogResults) {
    console.log(
      `- [${item.action}] ${item.log.action} | ${item.log.targetType}`,
    );
  }
  console.log("Problem IDs:");
  for (const problem of problems) {
    console.log(`- ${problem._id} :: ${problem.title}`);
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("seedRandomSampleData failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
