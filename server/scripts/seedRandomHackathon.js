import "dotenv/config";
import mongoose from "mongoose";
import Event from "../models/Event.js";
import Problem from "../models/Problem.js";

function randomSuffix(length = 6) {
  return Math.random()
    .toString(36)
    .slice(2, 2 + length)
    .toUpperCase();
}

function getHackathonProblems(eventId) {
  return [
    {
      title: "Array Domain: Maximum Subarray Sum",
      statement:
        "Given N integers, print the maximum possible sum of any contiguous subarray.",
      sampleInput: "8\n-2 -3 4 -1 -2 1 5 -3",
      sampleOutput: "7",
      expectedOutput: "7",
      difficulty: "easy",
      tags: ["array", "kadane", "optimization"],
      eventIds: [eventId],
      isCompetitive: true,
      totalPoints: 100,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "basic_case",
          input: "8\n-2 -3 4 -1 -2 1 5 -3",
          expectedOutput: "7",
          isHidden: false,
          order: 0,
          weight: 1,
          timeLimitSeconds: 2,
          memoryLimitKb: 131072,
        },
      ],
    },
    {
      title: "String Domain: Longest Unique Substring Length",
      statement:
        "Given a lowercase string S, print the length of the longest substring with all unique characters.",
      sampleInput: "abcaabcdba",
      sampleOutput: "4",
      expectedOutput: "4",
      difficulty: "medium",
      tags: ["string", "sliding-window", "hashing"],
      eventIds: [eventId],
      isCompetitive: true,
      totalPoints: 100,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "repeated_chars",
          input: "abcaabcdba",
          expectedOutput: "4",
          isHidden: false,
          order: 0,
          weight: 1,
          timeLimitSeconds: 2,
          memoryLimitKb: 131072,
        },
      ],
    },
    {
      title: "Graph Domain: Shortest Path in Unweighted Graph",
      statement:
        "Given an undirected unweighted graph and source S, destination D, print shortest distance in number of edges.",
      sampleInput: "6 7\n1 2\n1 3\n2 4\n3 4\n4 5\n5 6\n2 6\n1 6",
      sampleOutput: "2",
      expectedOutput: "2",
      difficulty: "medium",
      tags: ["graph", "bfs", "shortest-path"],
      eventIds: [eventId],
      isCompetitive: true,
      totalPoints: 120,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "bfs_distance",
          input: "6 7\n1 2\n1 3\n2 4\n3 4\n4 5\n5 6\n2 6\n1 6",
          expectedOutput: "2",
          isHidden: false,
          order: 0,
          weight: 1,
          timeLimitSeconds: 2,
          memoryLimitKb: 131072,
        },
      ],
    },
    {
      title: "Dynamic Programming Domain: Climbing Stairs",
      statement:
        "You can climb 1 or 2 steps at a time. Given N, print total distinct ways to reach step N.",
      sampleInput: "7",
      sampleOutput: "21",
      expectedOutput: "21",
      difficulty: "easy",
      tags: ["dp", "fibonacci"],
      eventIds: [eventId],
      isCompetitive: true,
      totalPoints: 80,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "n7",
          input: "7",
          expectedOutput: "21",
          isHidden: false,
          order: 0,
          weight: 1,
          timeLimitSeconds: 2,
          memoryLimitKb: 131072,
        },
      ],
    },
    {
      title: "Greedy Domain: Minimum Platforms",
      statement:
        "Given arrival and departure times of trains, print minimum number of platforms needed so that no train waits.",
      sampleInput:
        "6\n900 940 950 1100 1500 1800\n910 1200 1120 1130 1900 2000",
      sampleOutput: "3",
      expectedOutput: "3",
      difficulty: "medium",
      tags: ["greedy", "sorting", "intervals"],
      eventIds: [eventId],
      isCompetitive: true,
      totalPoints: 110,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "classic_platform_case",
          input: "6\n900 940 950 1100 1500 1800\n910 1200 1120 1130 1900 2000",
          expectedOutput: "3",
          isHidden: false,
          order: 0,
          weight: 1,
          timeLimitSeconds: 2,
          memoryLimitKb: 131072,
        },
      ],
    },
    {
      title: "Math Domain: Prime Count in Range",
      statement:
        "Given integers L and R, print count of prime numbers in inclusive range [L, R].",
      sampleInput: "10 30",
      sampleOutput: "6",
      expectedOutput: "6",
      difficulty: "easy",
      tags: ["math", "sieve", "number-theory"],
      eventIds: [eventId],
      isCompetitive: true,
      totalPoints: 90,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "range_10_30",
          input: "10 30",
          expectedOutput: "6",
          isHidden: false,
          order: 0,
          weight: 1,
          timeLimitSeconds: 2,
          memoryLimitKb: 131072,
        },
      ],
    },
    {
      title: "Data Structure Domain: LRU Cache Simulation",
      statement:
        "Given cache capacity C and sequence of page requests, print cache misses using LRU policy.",
      sampleInput: "3\n12\n1 2 3 1 4 5 2 1 2 3 4 5",
      sampleOutput: "10",
      expectedOutput: "10",
      difficulty: "hard",
      tags: ["data-structures", "hashmap", "doubly-linked-list", "lru"],
      eventIds: [eventId],
      isCompetitive: true,
      totalPoints: 150,
      passingThreshold: 100,
      isActive: true,
      testCases: [
        {
          name: "lru_miss_count",
          input: "3\n12\n1 2 3 1 4 5 2 1 2 3 4 5",
          expectedOutput: "10",
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

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const now = new Date();
  const startAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const endAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const suffix = randomSuffix();
  const event = await Event.create({
    title: `JIT Hackathon ${suffix}`,
    description:
      "Random seeded hackathon event with 7 cross-domain coding problems.",
    startAt,
    endAt,
  });

  const problemsPayload = getHackathonProblems(event._id);
  const problems = await Problem.insertMany(problemsPayload);

  console.log("\nSeed complete");
  console.log(`Event ID: ${event._id}`);
  console.log(`Event Title: ${event.title}`);
  console.log(`Problems Created: ${problems.length}`);
  console.log(
    "Domains Included: Array, String, Graph, DP, Greedy, Math, Data Structure",
  );
  console.log("Problem IDs:");
  for (const problem of problems) {
    console.log(`- ${problem._id} :: ${problem.title}`);
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("seedRandomHackathon failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
