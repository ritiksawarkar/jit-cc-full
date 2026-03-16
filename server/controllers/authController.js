import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    process.env.AUTH_JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function userPayload(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// POST /api/auth/register  (also aliased to /api/auth/signup)
export async function register(req, res) {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Name, email, and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    if (String(password).length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(String(password), 12);
    const user = await User.create({
      name: String(name).trim().slice(0, 80),
      email: normalizedEmail,
      password: hashedPassword,
    });

    const token = signToken(user);
    return res.status(201).json({ token, user: userPayload(user) });
  } catch (err) {
    console.error("Register error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ error: "Email already in use" });
    }
    return res.status(500).json({ error: "Unable to create account" });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Explicitly select password since it is excluded by default
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password",
    );

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(String(password), user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken(user);
    return res.json({ token, user: userPayload(user) });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Unable to sign in right now" });
  }
}
