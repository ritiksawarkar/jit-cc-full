import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

async function run() {
  const email = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const name = String(process.env.ADMIN_NAME || "Platform Admin").trim();

  if (!email || !password) {
    console.error("Missing ADMIN_EMAIL or ADMIN_PASSWORD in environment");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ email }).select("+password");
  if (existing) {
    existing.name = name.slice(0, 80);
    existing.password = password;
    existing.role = "admin";
    await existing.save();
    console.log(`Updated existing admin: ${email}`);
  } else {
    await User.create({
      name: name.slice(0, 80),
      email,
      password,
      role: "admin",
    });
    console.log(`Created admin: ${email}`);
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("seedAdmin failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
