/**
 * Seed Test Notifications
 * Run this script to add random test notifications to the database
 * Usage: node scripts/seedTestNotifications.js
 */

import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const MONGO_URI = process.env.MONGO_URI;

const testNotifications = [
  {
    type: "submission",
    title: "✅ All Tests Passed!",
    message: "Your submission scored 100/100 - Perfect!",
    description: "Congratulations! All test cases passed.",
    priority: "high",
  },
  {
    type: "submission",
    title: "❌ Submission Failed",
    message: "2 test case(s) failed. Review and try again.",
    description:
      "Your code failed some test cases. Please review the expected output.",
    priority: "normal",
  },
  {
    type: "event",
    title: "📢 New Event: Spring Coding Challenge",
    message:
      "A new event 'Spring Coding Challenge' is now available for registration",
    description: "Join us for an exciting coding competition!",
    priority: "high",
  },
  {
    type: "account",
    title: "🚫 Account Frozen",
    message: "Your account has been suspended by an administrator",
    description: "Reason: Violation of community guidelines",
    priority: "critical",
  },
  {
    type: "certificate",
    title: "🏆 Certificate Issued",
    message: "Your certificate for 'Winter Hackathon' has been generated",
    description: "Download your certificate now!",
    priority: "high",
  },
  {
    type: "problem",
    title: "📝 New Problem: Binary Tree Traversal",
    message: "A new problem has been released in the current event",
    description: "Implement in-order, pre-order, and post-order traversal",
    priority: "high",
  },
  {
    type: "admin_message",
    title: "📧 Server Maintenance Scheduled",
    message: "System maintenance scheduled for tonight 11 PM - 1 AM",
    description:
      "Please save your work before 11 PM. The system will be temporarily unavailable.",
    priority: "normal",
  },
  {
    type: "submission",
    title: "⚠️ Compilation Error",
    message: "Your code failed to compile. Check the error details.",
    description: "Syntax Error: Unexpected token",
    priority: "normal",
  },
  {
    type: "event",
    title: "🚀 Event Started: Spring Coding Challenge",
    message: "Spring Coding Challenge has started! Start coding now.",
    description: "You have 2 hours to complete the challenges.",
    priority: "critical",
  },
  {
    type: "problem",
    title: "🔄 Problem Updated: Arrays & Sorting",
    message: "A problem statement has been updated. Please review the changes.",
    description: "Updated constraints and additional test cases added.",
    priority: "normal",
  },
];

async function seedNotifications() {
  try {
    // Check if MONGO_URI is set
    if (!MONGO_URI) {
      console.error("❌ Error: MONGO_URI environment variable is not set!");
      console.error("   Please set MONGO_URI in your .env or .env.local file");
      process.exit(1);
    }

    // Connect to MongoDB
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB!");

    // Get a random student user
    const students = await User.find({ role: "student" }).limit(5);
    if (students.length === 0) {
      console.log("❌ No student users found in the database!");
      console.log("   Please create a student account first through the app.");
      process.exit(1);
    }

    const randomStudent = students[Math.floor(Math.random() * students.length)];
    console.log(
      `👤 Using student: ${randomStudent.name} (${randomStudent.email})`,
    );

    // Create notifications for random students
    const notificationsToInsert = [];
    for (const testNotif of testNotifications) {
      const randomStudent =
        students[Math.floor(Math.random() * students.length)];
      notificationsToInsert.push({
        userId: randomStudent._id,
        ...testNotif,
        actionUrl: "/compiler",
        actionLabel: "View",
        metadata: {
          testData: true,
          createdAt: new Date().toISOString(),
        },
      });
    }

    // Insert all notifications
    console.log(
      `\n📝 Creating ${notificationsToInsert.length} test notifications...`,
    );
    const created = await Notification.insertMany(notificationsToInsert);
    console.log(`✅ Successfully created ${created.length} notifications!`);

    // Show summary
    console.log("\n📊 Notification Summary:");
    console.log("================================");
    for (const notif of created) {
      const student = students.find(
        (s) => s._id.toString() === notif.userId.toString(),
      );
      console.log(`✅ ${notif.type.toUpperCase()}: ${notif.title}`);
      console.log(`   Student: ${student?.name}`);
      console.log(`   Priority: ${notif.priority}`);
      console.log("");
    }

    console.log("🎉 Test notifications added successfully!");
    console.log("\n📱 How to view them:");
    console.log("   1. Go to the Compiler page");
    console.log("   2. Look for the 🔔 bell icon (top right, next to Deps)");
    console.log("   3. Click the bell icon to see notifications");
    console.log("   4. Or go to /notifications for full page");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding notifications:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the seed function
seedNotifications();
