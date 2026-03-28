import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import Event from "../models/Event.js";
import EventLeaderboard from "../models/EventLeaderboard.js";
import CertificateTemplate from "../models/CertificateTemplate.js";
import Certificate from "../models/Certificate.js";

function randomCode(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

async function upsertDemoUser(index) {
  if (index === 0) {
    // First user - primary demo account
    const email = "demo.student@jit.local";
    const password = "Demo@12345";
    const name = "Demo Student";

    let user = await User.findOne({ email }).select("+password");
    if (!user) {
      user = await User.create({
        name,
        email,
        password,
        role: "student",
      });
      return { user, created: true, password };
    }

    user.name = name;
    user.password = password;
    user.role = "student";
    user.isFrozen = false;
    user.mustResetPassword = false;
    await user.save();
    return { user, created: false, password };
  }

  // Additional demo students
  const demoStudents = [
    { name: "Alice Johnson", email: "alice.johnson@jit.local" },
    { name: "Bob Singh", email: "bob.singh@jit.local" },
    { name: "Carol Patel", email: "carol.patel@jit.local" },
    { name: "David Kumar", email: "david.kumar@jit.local" },
    { name: "Emily Chen", email: "emily.chen@jit.local" },
    { name: "Frank Wilson", email: "frank.wilson@jit.local" },
    { name: "Grace Lee", email: "grace.lee@jit.local" },
    { name: "Henry Brown", email: "henry.brown@jit.local" },
    { name: "Iris Martinez", email: "iris.martinez@jit.local" },
  ];

  const student = demoStudents[index - 1];
  const password = "Demo@12345";

  let user = await User.findOne({ email: student.email }).select("+password");
  if (!user) {
    user = await User.create({
      name: student.name,
      email: student.email,
      password,
      role: "student",
    });
    return { user, created: true, password };
  }

  user.name = student.name;
  user.password = password;
  user.role = "student";
  user.isFrozen = false;
  user.mustResetPassword = false;
  await user.save();
  return { user, created: false, password };
}

async function upsertDemoEvent() {
  const title = "Demo Certificate Showcase Event";
  const now = new Date();
  const startAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const endAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let event = await Event.findOne({ title });
  if (!event) {
    event = await Event.create({
      title,
      description: "Seeded event for certificate demo preview.",
      startAt,
      endAt,
    });
    return { event, created: true };
  }

  event.description = "Seeded event for certificate demo preview.";
  event.startAt = startAt;
  event.endAt = endAt;
  await event.save();
  return { event, created: false };
}

async function upsertLeaderboard(event, users) {
  // Define score/merit mapping for ranking
  const scoreConfig = [
    { score: 100, merit: "gold" }, // Rank 1
    { score: 98, merit: "gold" }, // Rank 2
    { score: 95, merit: "gold" }, // Rank 3
    { score: 88, merit: "silver" }, // Rank 4
    { score: 85, merit: "silver" }, // Rank 5
    { score: 78, merit: "bronze" }, // Rank 6
    { score: 72, merit: "bronze" }, // Rank 7
    { score: 65, merit: "bronze" }, // Rank 8
    { score: 58, merit: "bronze" }, // Rank 9
    { score: 50, merit: "bronze" }, // Rank 10
  ];

  const entries = users.map((user, index) => {
    const config = scoreConfig[index];
    const lastSubmissionTime = new Date(
      Date.now() - index * 60 * 60 * 1000, // Each user 1 hour earlier submission
    );

    return {
      rank: index + 1,
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      totalScore: config.score,
      totalPossibleScore: 100,
      percentage: config.score,
      passedProblems: Math.max(1, 3 - Math.floor(index / 3)), // Fewer problems for lower ranks
      totalAttempts: 3 + index, // More attempts for lower ranks
      lastSubmissionTime,
      merit: config.merit,
      tiebreaker: {
        score: config.score,
        passedProblems: Math.max(1, 3 - Math.floor(index / 3)),
        lastSubmissionTime,
        attempts: 3 + index,
      },
    };
  });

  const leaderboard = await EventLeaderboard.findOneAndUpdate(
    { eventId: event._id },
    {
      $set: {
        eventId: event._id,
        entries,
        isFinal: true,
        isPublished: true,
        computedAt: new Date(),
        finalizedAt: new Date(),
        publishedAt: new Date(),
        stats: {
          totalParticipants: users.length,
          totalSubmissions: users.length * 3,
          totalProblems: 3,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return leaderboard;
}

async function upsertTemplate(event) {
  await CertificateTemplate.updateMany(
    { eventId: event._id, isDefault: true },
    { $set: { isDefault: false } },
  );

  const name = "Demo Branded Template";
  let template = await CertificateTemplate.findOne({
    eventId: event._id,
    name,
  });
  if (!template) {
    template = await CertificateTemplate.create({
      eventId: event._id,
      name,
      templateText:
        "Congratulations {{userName}} for outstanding performance in {{eventTitle}}.",
      isDefault: true,
      isActive: true,
    });
    return template;
  }

  template.templateText =
    "Congratulations {{userName}} for outstanding performance in {{eventTitle}}.";
  template.isDefault = true;
  template.isActive = true;
  await template.save();
  return template;
}

async function upsertCertificate(
  event,
  user,
  template,
  leaderboard,
  rank,
  merit,
  totalScore,
) {
  let certificate = await Certificate.findOne({
    eventId: event._id,
    userId: user._id,
  });

  if (!certificate) {
    certificate = await Certificate.create({
      eventId: event._id,
      userId: user._id,
      templateId: template._id,
      leaderboardSnapshotId: leaderboard._id,
      certificateNo: randomCode("CERT-DEMO"),
      verificationCode: randomCode("VERIFY-DEMO"),
      status: "issued",
      issuedAt: new Date(),
      rank,
      totalScore,
      merit,
      payload: {
        userName: user.name,
        userEmail: user.email,
        eventTitle: event.title,
        rank,
        totalScore,
        merit,
        generatedAt: new Date().toISOString(),
      },
    });
    return { certificate, created: true };
  }

  certificate.templateId = template._id;
  certificate.leaderboardSnapshotId = leaderboard._id;
  certificate.status = "issued";
  certificate.issuedAt = new Date();
  certificate.rank = rank;
  certificate.totalScore = totalScore;
  certificate.merit = merit;
  certificate.payload = {
    userName: user.name,
    userEmail: user.email,
    eventTitle: event.title,
    rank,
    totalScore,
    merit,
    generatedAt: new Date().toISOString(),
  };
  if (!certificate.certificateNo) {
    certificate.certificateNo = randomCode("CERT-DEMO");
  }
  if (!certificate.verificationCode) {
    certificate.verificationCode = randomCode("VERIFY-DEMO");
  }
  await certificate.save();
  return { certificate, created: false };
}

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  // Create 10 demo students
  const users = [];
  const userCredentials = [];
  for (let i = 0; i < 10; i++) {
    const { user, password } = await upsertDemoUser(i);
    users.push(user);
    userCredentials.push({ email: user.email, password });
  }

  const { event } = await upsertDemoEvent();
  const leaderboard = await upsertLeaderboard(event, users);
  const template = await upsertTemplate(event);

  // Create certificates for all users
  const certificates = [];
  for (let i = 0; i < users.length; i++) {
    const entry = leaderboard.entries[i];
    const { certificate } = await upsertCertificate(
      event,
      users[i],
      template,
      leaderboard,
      entry.rank,
      entry.merit,
      entry.totalScore,
    );
    certificates.push(certificate);
  }

  console.log("\n✅ Demo leaderboard seed complete!\n");
  console.log(`📊 Event: ${event.title}`);
  console.log(`👥 Total Students: ${users.length}`);
  console.log(
    `🥇 Gold Medals: 3 | 🥈 Silver Medals: 2 | 🥉 Bronze Medals: 5\n`,
  );

  console.log("📋 Login Credentials (all use password: Demo@12345):\n");
  userCredentials.forEach((cred, idx) => {
    const rank = idx + 1;
    const medal = rank <= 3 ? "🥇" : rank <= 5 ? "🥈" : "🥉";
    console.log(`${medal} Rank ${rank}: ${cred.email}`);
  });

  console.log("\n🏆 Certificate Details:\n");
  certificates.forEach((cert, idx) => {
    const rank = idx + 1;
    const medal = rank <= 3 ? "🥇" : rank <= 5 ? "🥈" : "🥉";
    console.log(
      `${medal} Rank ${idx + 1} - Certificate No: ${cert.certificateNo}`,
    );
    console.log(`   Verification Code: ${cert.verificationCode}\n`);
  });

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("seedDemoCertificate failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
