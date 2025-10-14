import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs, { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJudge0Client } from "./judge0.js";
import { GoogleGenAI } from "@google/genai";

const app = express();

app.use(
  cors({
    origin: "*", // Allow all origins for testing
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "2mb" })); // Increased limit for AI prompts
app.use(morgan("dev"));

const PORT = process.env.PORT || 9009;
const HOST = process.env.JUDGE0_HOST; // e.g., judge029.p.rapidapi.com
const KEY = process.env.JUDGE0_API_KEY; // RapidAPI key
const GEMINI_KEY = process.env.GEMINI_API_KEY; // Gemini AI key
const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersPath = path.join(__dirname, "data", "users.json");
const leaderboardPath = path.join(__dirname, "data", "leaderboard.json");

let USERS = [];
try {
  const rawUsers = readFileSync(usersPath, "utf-8");
  USERS = JSON.parse(rawUsers);
} catch (err) {
  console.error("❌ Failed to load users.json", err);
  process.exit(1);
}

// Load leaderboard (optional file)
let LEADERBOARD = [];
try {
  const raw = readFileSync(leaderboardPath, "utf-8");
  LEADERBOARD = JSON.parse(raw);
} catch (err) {
  // If file missing, start with empty leaderboard
  LEADERBOARD = [];
}

// Validate keys
if (!HOST || !KEY) {
  console.error("❌ Missing JUDGE0_HOST or JUDGE0_API_KEY in .env");
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.error("❌ Missing GEMINI_API_KEY in .env");
  process.exit(1);
}
if (!AUTH_JWT_SECRET) {
  console.error("❌ Missing AUTH_JWT_SECRET in .env");
  process.exit(1);
}

const j0 = createJudge0Client({ host: HOST, apiKey: KEY });
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

// --------------------
// Health check
// --------------------
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "compiler-proxy + Gemini AI",
    time: new Date().toISOString(),
  });
});

// --------------------
// Judge0 Execute Endpoint
// --------------------
app.post("/api/execute", async (req, res) => {
  try {
    const { language_id, source_code, stdin = "" } = req.body || {};
    if (!language_id || typeof source_code !== "string") {
      return res
        .status(400)
        .json({ error: "language_id and source_code are required" });
    }

    const result = await j0.execute({ language_id, source_code, stdin });
    res.json(result);
  } catch (err) {
    console.error("Execute error:");
    if (err.response) {
      console.error("Upstream status:", err.response.status);
      console.error("Upstream headers:", err.response.headers);
      console.error("Upstream data:", err.response.data);
    } else {
      console.error(err);
    }

    res.status(err?.response?.status || 500).json({
      error: "Execution failed",
      message: err?.message || "Unknown error",
      upstream: err?.response?.data || null,
    });
  }
});

// --------------------
// Gemini AI Suggestions Endpoint
// --------------------
app.post("/api/ai-suggestions", async (req, res) => {
  try {
    const { code } = req.body; // user prompt
    if (!code) return res.status(400).json({ error: "Prompt is required" });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: code,
    });

    res.json({ suggestions: response.text });
  } catch (err) {
    console.error("AI error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Authentication Endpoint
// --------------------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = USERS.find((entry) => entry.email.toLowerCase() === normalizedEmail);

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
      },
      AUTH_JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Unable to sign in right now" });
  }
});

// --------------------
// Signup Endpoint
// --------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (USERS.find((u) => u.email.toLowerCase() === normalizedEmail)) {
      return res.status(409).json({ error: "Email already in use" });
    }

    // Basic password policy: >= 6 characters
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const id = `u-${Date.now()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = { id, name: String(name).trim(), email: normalizedEmail, passwordHash };

    // Persist to users.json (append in-memory and write file)
    USERS.push(newUser);
    try {
      await fs.promises.mkdir(path.join(__dirname, "data"), { recursive: true });
    } catch (e) {
      // ignore
    }
    try {
      await fs.promises.writeFile(usersPath, JSON.stringify(USERS, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to persist new user:", err);
      return res.status(500).json({ error: "Unable to create account" });
    }

    const token = jwt.sign({ sub: newUser.id, email: newUser.email, name: newUser.name }, AUTH_JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email } });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Unable to sign up right now" });
  }
});

// --------------------
// Leaderboard endpoints
// --------------------
app.get("/api/leaderboard", (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    // sort by score desc, then recent
    const items = (LEADERBOARD || [])
      .slice()
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.createdAt) - new Date(a.createdAt);
      })
      .slice(0, limit);
    res.json({ items });
  } catch (err) {
    console.error("Leaderboard read error:", err);
    res.status(500).json({ error: "Unable to read leaderboard" });
  }
});

// submit a score (requires Authorization: Bearer <token>)
app.post("/api/leaderboard", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization required" });
    }
    const token = auth.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, AUTH_JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { score } = req.body || {};
    const n = Number(score);
    if (!Number.isFinite(n) || isNaN(n)) {
      return res.status(400).json({ error: "Score must be a number" });
    }

    const userId = payload.sub;
    const user = USERS.find((u) => u.id === userId) || { id: userId, name: payload.name || "Unknown" };

    const entry = {
      id: `lb-${Date.now()}`,
      userId: user.id,
      name: user.name || user.email || "Anonymous",
      score: n,
      createdAt: new Date().toISOString(),
    };

    LEADERBOARD.push(entry);
    try {
      await fs.promises.mkdir(path.join(__dirname, "data"), { recursive: true });
      await fs.promises.writeFile(leaderboardPath, JSON.stringify(LEADERBOARD, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to persist leaderboard:", err);
      // still return success but warn
    }

    res.status(201).json({ entry });
  } catch (err) {
    console.error("Leaderboard submit error:", err);
    res.status(500).json({ error: "Unable to submit score" });
  }
});

// --------------------
// Start server
// --------------------
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server listening on http://127.0.0.1:${PORT}`)
);
