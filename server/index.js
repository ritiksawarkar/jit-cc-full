import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import jwt from "jsonwebtoken";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import submissionRoutes from "./routes/submissionRoutes.js";
import problemRoutes from "./routes/problemRoutes.js";
import eventPublicRoutes from "./routes/eventPublicRoutes.js";
import eventSelectionRoutes from "./routes/eventSelectionRoutes.js";
import rewardRoutes from "./routes/rewardRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import fs, { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJudge0Client } from "./judge0.js";
import WebSocket, { WebSocketServer } from "ws";
import { GoogleGenAI } from "@google/genai";

const app = express();

app.use(
  cors({
    origin: "*", // Allow all origins for testing
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "8mb" })); // Supports base64 image payloads; controller-level guards enforce actual asset size limits
app.use(morgan("dev"));

// Normalize body parser failures to JSON responses (avoid HTML stack traces)
app.use((err, _req, res, next) => {
  if (!err) return next();
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Payload too large" });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  return next(err);
});

const PORT = process.env.PORT || 9009;
const HOST = process.env.JUDGE0_HOST; // e.g., judge029.p.rapidapi.com
const KEY = process.env.JUDGE0_API_KEY; // RapidAPI key
const GEMINI_KEY = process.env.GEMINI_API_KEY; // Gemini AI key
const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Allow dynamic project root configurable at runtime via /api/settings
// Default to the user's Documents/online-code-compiler folder if present or creatable,
// otherwise fall back to the repo root
let defaultRoot = path.join(__dirname, "..");
try {
  const home = process.env.USERPROFILE || process.env.HOME || null;
  if (home) {
    const docs = path.join(home, "Documents");
    const preferred = path.join(docs, "online-code-compiler");
    try {
      // Ensure Documents exists, then attempt to create preferred folder
      if (!fs.existsSync(docs)) {
        // if Documents doesn't exist, still try to create the preferred folder path (it will create parents)
        fs.mkdirSync(preferred, { recursive: true });
      } else {
        if (!fs.existsSync(preferred)) {
          fs.mkdirSync(preferred, { recursive: true });
        }
      }
      if (fs.existsSync(preferred) && fs.statSync(preferred).isDirectory()) {
        defaultRoot = preferred;
      }
    } catch (inner) {
      // couldn't create preferred, fall back to Documents or repo root
      if (fs.existsSync(docs) && fs.statSync(docs).isDirectory()) {
        defaultRoot = docs;
      }
    }
  }
} catch (e) {
  // ignore and use repo root
}
let SERVER_PROJECT_ROOT = defaultRoot;
const leaderboardPath = path.join(__dirname, "data", "leaderboard.json");

function getLeaderboardKey(entry = {}) {
  const userId = String(entry.userId || "").trim();
  if (userId) return `user:${userId}`;

  // Fallback for legacy rows where userId may be missing
  const normalizedName = String(entry.name || "")
    .trim()
    .toLowerCase();
  if (normalizedName) return `name:${normalizedName}`;

  return `row:${String(entry.id || "")}`;
}

function dedupeLeaderboard(entries = []) {
  const map = new Map();

  for (const item of entries || []) {
    const key = getLeaderboardKey(item);
    const current = map.get(key);
    if (!current) {
      map.set(key, item);
      continue;
    }

    const currentScore = Number(current.score || 0);
    const nextScore = Number(item.score || 0);
    if (nextScore > currentScore) {
      map.set(key, {
        ...current,
        ...item,
      });
      continue;
    }

    if (nextScore === currentScore) {
      const currentTime = new Date(
        current.updatedAt || current.createdAt || 0,
      ).getTime();
      const nextTime = new Date(
        item.updatedAt || item.createdAt || 0,
      ).getTime();
      if (nextTime > currentTime) {
        map.set(key, {
          ...current,
          ...item,
        });
      }
    }
  }

  return Array.from(map.values());
}

function buildRankedLeaderboard(entries = []) {
  const sorted = (entries || []).slice().sort((a, b) => {
    if (Number(b.score || 0) !== Number(a.score || 0)) {
      return Number(b.score || 0) - Number(a.score || 0);
    }
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return aTime - bTime;
  });

  let rank = 0;
  let lastScore = null;
  return sorted.map((entry, index) => {
    const score = Number(entry.score || 0);
    if (lastScore === null || score !== lastScore) {
      rank = index + 1;
      lastScore = score;
    }
    return {
      ...entry,
      rank,
    };
  });
}

// Load leaderboard (optional file)
let LEADERBOARD = [];
try {
  const raw = readFileSync(leaderboardPath, "utf-8");
  const parsed = JSON.parse(raw);
  LEADERBOARD = dedupeLeaderboard(Array.isArray(parsed) ? parsed : []);

  // Keep persisted data clean so duplicates don't come back after restart.
  fs.writeFileSync(
    leaderboardPath,
    JSON.stringify(LEADERBOARD, null, 2),
    "utf-8",
  );
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

function classifyAiFailure(errorText = "") {
  const t = String(errorText || "").toLowerCase();
  if (t.includes("consumer_suspended") || t.includes("has been suspended")) {
    return "AI provider denied access because the configured Gemini API key is suspended. Update GEMINI_API_KEY in server/.env.";
  }
  if (t.includes("api key not valid") || t.includes("invalid api key")) {
    return "AI provider rejected the API key. Verify GEMINI_API_KEY in server/.env.";
  }
  if (t.includes("quota") || t.includes("rate") || t.includes("429")) {
    return "AI provider quota or rate limit reached. Retry later or switch to another API key/model.";
  }
  if (t.includes("permission") || t.includes("403")) {
    return "AI provider permission error. Verify API key access to Generative Language API.";
  }
  return "AI provider is currently unavailable.";
}

function buildHeuristicSuggestion(promptText = "", providerWarning = "") {
  const text = String(promptText || "").toLowerCase();
  const hints = [];

  if (
    text.includes("undefined reference") ||
    text.includes("unresolved external")
  ) {
    hints.push(
      "Linker error: check function definitions, spelling, and whether all required source files/libraries are linked.",
    );
  }
  if (
    text.includes("no such file or directory") ||
    text.includes("cannot find")
  ) {
    hints.push(
      "Missing file/module: verify include/import paths and ensure the dependency exists in the project.",
    );
  }
  if (
    (text.includes("expected") && text.includes(";")) ||
    text.includes("syntax error")
  ) {
    hints.push(
      "Syntax issue: inspect nearby lines for missing separators/brackets and mismatched delimiters.",
    );
  }
  if (
    text.includes("type") &&
    (text.includes("mismatch") ||
      text.includes("cannot convert") ||
      text.includes("incompatible"))
  ) {
    hints.push(
      "Type mismatch: align function signatures, variable types, and casts with the API expectations.",
    );
  }
  if (
    text.includes("segmentation fault") ||
    text.includes("core dumped") ||
    text.includes("null pointer")
  ) {
    hints.push(
      "Runtime memory error: validate pointer/null checks, array bounds, and object lifetimes.",
    );
  }
  if (text.includes("time limit") || text.includes("timeout")) {
    hints.push(
      "Performance issue: reduce algorithmic complexity and avoid unbounded loops.",
    );
  }

  if (!hints.length) {
    hints.push(
      "Compilation/runtime error: inspect the first reported error line, then fix root-cause issues before downstream errors.",
    );
  }

  const providerLine = classifyAiFailure(providerWarning);

  return [
    `${providerLine} Showing rule-based fallback help instead:`,
    ...hints.map((h, i) => `${i + 1}. ${h}`),
    "",
    "Tip: start with the earliest error in compile/stderr output; later messages are often cascading effects.",
  ].join("\n");
}

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

    const normalizedStdin = String(stdin ?? "").replace(/\r\n/g, "\n");

    const result = await j0.execute({
      language_id,
      source_code,
      stdin: normalizedStdin,
    });
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
    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const extractGeminiText = async (response) => {
      try {
        if (typeof response?.text === "function") {
          const viaFn = await response.text();
          if (typeof viaFn === "string" && viaFn.trim()) return viaFn;
        }
      } catch {
        // ignore and try other response shapes
      }

      if (typeof response?.text === "string" && response.text.trim()) {
        return response.text;
      }

      return (
        response?.candidates?.[0]?.content?.parts
          ?.map((p) => (typeof p?.text === "string" ? p.text : ""))
          .join("") || ""
      );
    };

    const requestModelText = async (model, prompt) => {
      // 1) Try official SDK
      try {
        const sdkResponse = await ai.models.generateContent({
          model,
          contents: prompt,
        });
        const sdkText = await extractGeminiText(sdkResponse);
        if (sdkText.trim()) {
          return sdkText;
        }
      } catch {
        // fall through to REST fallback
      }

      // 2) Fallback to direct REST API for compatibility across SDK versions
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
      const restRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      const restJson = await restRes.json().catch(() => ({}));
      if (!restRes.ok) {
        throw new Error(
          restJson?.error?.message ||
            `Gemini REST error (${restRes.status}) for model ${model}`,
        );
      }

      return (
        restJson?.candidates?.[0]?.content?.parts
          ?.map((p) => (typeof p?.text === "string" ? p.text : ""))
          .join("") || ""
      );
    };

    const candidateModels = [
      process.env.GEMINI_MODEL,
      "gemini-2.5-flash",
      "gemini-1.5-flash",
    ].filter(Boolean);

    let lastError = null;
    for (const model of candidateModels) {
      try {
        const text = await requestModelText(model, code);

        if (text.trim()) {
          return res.json({ suggestions: text, model, fallback: false });
        }

        lastError = new Error(`No text returned from model ${model}`);
      } catch (err) {
        lastError = err;
      }
    }

    const upstreamError = String(
      lastError?.message || "AI provider unavailable",
    );
    const fallbackText = buildHeuristicSuggestion(code, upstreamError);
    res.status(200).json({
      suggestions: fallbackText,
      fallback: true,
      warning: upstreamError,
    });
  } catch (err) {
    console.error("AI error:", err);
    res.status(200).json({
      suggestions: buildHeuristicSuggestion(req?.body?.code, err?.message),
      fallback: true,
      warning: String(err?.message || "Unexpected AI error"),
    });
  }
});

// --------------------
// Authentication Routes (MongoDB-backed)
// --------------------
app.use("/api/auth", authRoutes);

// --------------------
// Submission Routes (MongoDB-backed)
// --------------------
app.use("/api/submissions", submissionRoutes);

// --------------------
// Problem Routes (MongoDB-backed)
// --------------------
app.use("/api/problems", problemRoutes);

// --------------------
// Admin Routes (MongoDB-backed)
// --------------------
app.use("/api/admin", adminRoutes);

// --------------------
// Event Selection Routes (MongoDB-backed)
// --------------------
app.use("/api/events", eventSelectionRoutes);

// --------------------
// Event Public Routes (MongoDB-backed)
// --------------------
app.use("/api/events", eventPublicRoutes);

// --------------------
// Reward Routes (MongoDB-backed)
// --------------------
app.use("/api/rewards", rewardRoutes);

// --------------------
// Certificate Routes (MongoDB-backed)
// --------------------
app.use("/api/certificates", certificateRoutes);

// --------------------
// Leaderboard endpoints
// --------------------
app.get("/api/leaderboard", (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    LEADERBOARD = dedupeLeaderboard(LEADERBOARD || []);
    const rankedItems = buildRankedLeaderboard(LEADERBOARD || []);
    const items = rankedItems.slice(0, limit);

    // Return compact stats to improve client-side rendering without extra calls.
    const stats = {
      totalPlayers: rankedItems.length,
      topScore: rankedItems[0]?.score ?? 0,
      averageScore:
        rankedItems.length > 0
          ? Math.round(
              (rankedItems.reduce(
                (sum, item) => sum + Number(item.score || 0),
                0,
              ) /
                rankedItems.length) *
                100,
            ) / 100
          : 0,
    };

    res.json({ items, stats });
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
    if (n < 0) {
      return res.status(400).json({ error: "Score must be zero or positive" });
    }

    const userId = payload.sub;
    const user = {
      id: userId,
      name: payload.name || "Unknown",
    };

    const now = new Date().toISOString();
    const existingIndex = (LEADERBOARD || []).findIndex(
      (item) =>
        getLeaderboardKey(item) ===
        getLeaderboardKey({ userId: user.id, name: user.name }),
    );

    let entry;
    if (existingIndex >= 0) {
      const prev = LEADERBOARD[existingIndex];
      const prevScore = Number(prev?.score || 0);
      const bestScore = n > prevScore ? n : prevScore;
      entry = {
        ...prev,
        userId: user.id,
        name: user.name || prev?.name || "Anonymous",
        score: bestScore,
        updatedAt: now,
      };
      LEADERBOARD[existingIndex] = entry;
    } else {
      entry = {
        id: `lb-${Date.now()}`,
        userId: user.id,
        name: user.name || "Anonymous",
        score: n,
        createdAt: now,
        updatedAt: now,
      };
      LEADERBOARD.push(entry);
    }
    try {
      await fs.promises.mkdir(path.join(__dirname, "data"), {
        recursive: true,
      });
      await fs.promises.writeFile(
        leaderboardPath,
        JSON.stringify(LEADERBOARD, null, 2),
        "utf-8",
      );
    } catch (err) {
      console.error("Failed to persist leaderboard:", err);
      // still return success but warn
    }

    LEADERBOARD = dedupeLeaderboard(LEADERBOARD || []);
    const rankedItems = buildRankedLeaderboard(LEADERBOARD || []);
    const rankedEntry =
      rankedItems.find((item) => item.id === entry.id) || entry;
    res.status(201).json({ entry: rankedEntry });
  } catch (err) {
    console.error("Leaderboard submit error:", err);
    res.status(500).json({ error: "Unable to submit score" });
  }
});

// --------------------
// Project Structure Endpoint
// --------------------
// Recursively read project structure (client folder)
function getProjectStructure(dir, maxDepth = 3, currentDepth = 0, ignore = []) {
  if (currentDepth >= maxDepth) return null;

  const items = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip node_modules, .git, dist, and hidden files
      if (ignore.includes(entry.name) || entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const children = getProjectStructure(
          fullPath,
          maxDepth,
          currentDepth + 1,
          ignore,
        );
        items.push({
          name: entry.name,
          type: "folder",
          children: children || [],
        });
      } else {
        items.push({
          name: entry.name,
          type: "file",
          size: entry.size || 0,
        });
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }
  return items;
}

// Read file contents endpoint
app.post("/api/read-file", (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "filePath is required" });
    }

    // Security: prevent directory traversal attacks
    const projectRoot = SERVER_PROJECT_ROOT;
    const fullPath = path.resolve(path.join(projectRoot, filePath));

    // Ensure the path is within the project root
    if (!fullPath.startsWith(projectRoot)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Check if file exists and is readable
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: "Path is a directory, not a file" });
    }

    // Limit file size (10MB max)
    if (stats.size > 10 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large" });
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    res.json({ content, path: filePath, size: stats.size });
  } catch (err) {
    console.error("Read file error:", err);
    res
      .status(500)
      .json({ error: "Unable to read file", details: err.message });
  }
});

// Save/update file endpoint
app.put("/api/save-file", (req, res) => {
  try {
    const { filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res
        .status(400)
        .json({ error: "filePath and content are required" });
    }

    const projectRoot = SERVER_PROJECT_ROOT;
    const fullPath = path.resolve(path.join(projectRoot, filePath));

    if (!fullPath.startsWith(projectRoot)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if trying to save to a directory
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      return res.status(400).json({ error: "Path is a directory, not a file" });
    }

    // Create backup if file exists
    if (fs.existsSync(fullPath)) {
      const backupPath = `${fullPath}.backup`;
      fs.copyFileSync(fullPath, backupPath);
    }

    // Write file
    fs.writeFileSync(fullPath, content, "utf-8");
    res.json({
      success: true,
      path: filePath,
      size: content.length,
      message: "File saved successfully",
    });
  } catch (err) {
    console.error("Save file error:", err);
    res
      .status(500)
      .json({ error: "Unable to save file", details: err.message });
  }
});

// Delete file endpoint
app.delete("/api/files/:pathParam", (req, res) => {
  try {
    const filePath = Buffer.from(req.params.pathParam, "base64").toString(
      "utf-8",
    );

    // Use the configured server project root so delete targets the same workspace
    const projectRoot = SERVER_PROJECT_ROOT;
    const fullPath = path.resolve(path.join(projectRoot, filePath));

    if (!fullPath.startsWith(projectRoot)) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      // Delete directory recursively
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      // Delete file
      fs.unlinkSync(fullPath);
    }

    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Unable to delete", details: err.message });
  }
});

// Rename file endpoint
app.put("/api/files/rename/:pathParam", (req, res) => {
  try {
    const oldPath = Buffer.from(req.params.pathParam, "base64").toString(
      "utf-8",
    );
    const { newName } = req.body;

    if (!newName) {
      return res.status(400).json({ error: "newName is required" });
    }

    const projectRoot = SERVER_PROJECT_ROOT;
    const fullOldPath = path.resolve(path.join(projectRoot, oldPath));
    const dir = path.dirname(fullOldPath);
    const fullNewPath = path.join(dir, newName);

    if (
      !fullOldPath.startsWith(projectRoot) ||
      !fullNewPath.startsWith(projectRoot)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!fs.existsSync(fullOldPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    if (fs.existsSync(fullNewPath)) {
      return res.status(409).json({ error: "Target already exists" });
    }

    fs.renameSync(fullOldPath, fullNewPath);
    const newRelPath = path
      .relative(projectRoot, fullNewPath)
      .replace(/\\/g, "/");

    res.json({
      success: true,
      oldPath,
      newPath: newRelPath,
      message: "Renamed successfully",
    });
  } catch (err) {
    console.error("Rename error:", err);
    res.status(500).json({ error: "Unable to rename", details: err.message });
  }
});

// Create file endpoint
app.post("/api/files/create", (req, res) => {
  try {
    const { filePath, content = "" } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: "filePath is required" });
    }

    const projectRoot = SERVER_PROJECT_ROOT;
    let fullPath = path.resolve(path.join(projectRoot, filePath));

    // Normalize path - remove double slashes
    fullPath = path.normalize(fullPath);

    console.log("📝 Create file request:", { filePath, fullPath, projectRoot });

    if (!fullPath.startsWith(projectRoot)) {
      return res
        .status(403)
        .json({ error: "Access denied - path outside project" });
    }

    // Validate filename has an extension and is allowed, but permit dotfiles
    const baseName = path.basename(fullPath || "");
    const allowedExts = new Set([
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "java",
      "c",
      "cpp",
      "rs",
      "go",
      "html",
      "css",
      "json",
      "md",
      "txt",
      "sh",
      "bash",
      "yml",
      "yaml",
    ]);

    // Allow dotfiles (e.g., .gitkeep) so the frontend can create placeholder files when creating folders.
    // For regular filenames (not starting with a dot) enforce extension whitelist.
    if (!baseName.startsWith(".")) {
      const m = baseName.match(/\.([a-z0-9]+)$/i);
      if (!m) {
        return res
          .status(400)
          .json({ error: "file must include an extension (e.g. main.cpp)" });
      }
      const ext = m[1].toLowerCase();
      if (!allowedExts.has(ext)) {
        return res
          .status(400)
          .json({ error: `Unsupported file extension '.${ext}'` });
      }
    } else {
      console.log("Creating dotfile:", baseName);
    }

    if (fs.existsSync(fullPath)) {
      console.warn("⚠️ File already exists:", fullPath);
      return res
        .status(409)
        .json({ error: `File already exists: ${path.basename(fullPath)}` });
    }

    // Create directory if needed
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log("📁 Created directory:", dir);
    }

    fs.writeFileSync(fullPath, content, "utf-8");
    console.log("✅ File created successfully:", fullPath);

    res.json({
      success: true,
      path: filePath,
      size: content.length,
      message: "File created successfully",
    });
  } catch (err) {
    console.error("❌ Create file error:", err);
    res
      .status(500)
      .json({ error: "Unable to create file", details: err.message });
  }
});

// Create folder endpoint (creates directory recursively)
app.post("/api/folders/create", (req, res) => {
  try {
    const { folderPath } = req.body || {};
    if (!folderPath)
      return res.status(400).json({ error: "folderPath is required" });

    const projectRoot = SERVER_PROJECT_ROOT;
    const fullPath = path.resolve(path.join(projectRoot, folderPath));
    if (!fullPath.startsWith(projectRoot))
      return res
        .status(403)
        .json({ error: "Access denied - path outside project" });

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      return res.status(409).json({ error: "Folder already exists" });
    }

    fs.mkdirSync(fullPath, { recursive: true });
    console.log("📁 Folder created:", fullPath);
    res.json({
      success: true,
      path: folderPath,
      message: "Folder created successfully",
    });
  } catch (err) {
    console.error("Create folder error:", err);
    res
      .status(500)
      .json({ error: "Unable to create folder", details: err.message });
  }
});

// Search in files endpoint
app.post("/api/search", (req, res) => {
  try {
    const { query, maxResults = 50 } = req.body;

    if (!query || query.trim().length < 2) {
      return res
        .status(400)
        .json({ error: "Query must be at least 2 characters" });
    }

    const projectRoot = SERVER_PROJECT_ROOT;
    const results = [];
    let fileCount = 0;

    function searchInDirectory(dir, depth = 0) {
      if (depth > 4 || fileCount >= maxResults) return;

      const ignore = ["node_modules", ".git", "dist", "build", ".next", "out"];

      try {
        const files = fs.readdirSync(dir);

        for (const file of files) {
          if (fileCount >= maxResults) break;
          if (ignore.includes(file)) continue;

          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);

          if (stats.isDirectory()) {
            searchInDirectory(filePath, depth + 1);
          } else if (stats.isFile() && stats.size < 5 * 1024 * 1024) {
            try {
              const content = fs.readFileSync(filePath, "utf-8");
              const lines = content.split("\n");
              const relPath = path
                .relative(projectRoot, filePath)
                .replace(/\\/g, "/");
              let matchCount = 0;

              lines.forEach((line, idx) => {
                if (
                  line.toLowerCase().includes(query.toLowerCase()) &&
                  matchCount < 3
                ) {
                  results.push({
                    file: relPath,
                    lineNum: idx + 1,
                    line: line.trim().substring(0, 100),
                  });
                  matchCount++;
                  fileCount++;
                }
              });
            } catch {}
          }
        }
      } catch {}
    }

    searchInDirectory(projectRoot);
    res.json({ results, total: results.length });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed", details: err.message });
  }
});

// --------------------
// Execute arbitrary (restricted) shell command
// --------------------
app.post("/api/exec", async (req, res) => {
  try {
    const {
      command,
      cwd = ".",
      input = "",
      timeoutMs = 10000,
    } = req.body || {};
    if (!command || typeof command !== "string")
      return res.status(400).json({ error: "command is required" });

    // Allow running everything when explicitly enabled via env var (use with caution)
    const allowAll =
      String(process.env.ALLOW_EXEC_ALL || "").toLowerCase() === "true";

    // Basic whitelist approach by default: allow only known safe commands (first token)
    const allowed = new Set([
      "ls",
      "pwd",
      "cat",
      "type",
      "echo",
      "node",
      "python",
      "python3",
      "npm",
      "npx",
      "dir",
      "git",
    ]);

    const first = command.trim().split(/\s+/)[0];
    if (!allowAll && !allowed.has(first)) {
      return res
        .status(403)
        .json({ error: "Command not allowed", command: first });
    }

    // Use configured project root for command execution so the UI and server agree
    const projectRoot = SERVER_PROJECT_ROOT || path.join(__dirname, "..");
    const runCwd = path.resolve(path.join(projectRoot, String(cwd || ".")));
    if (!runCwd.startsWith(projectRoot))
      return res
        .status(403)
        .json({ error: "Access denied - cwd outside project" });

    // Spawn command. On Windows, prefer PowerShell so common shell commands
    // (ls, cat, pwd, etc.) work consistently in the app terminal.
    const { spawn } = await import("node:child_process");
    const isWindows = process.platform === "win32";
    const proc = isWindows
      ? spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            command,
          ],
          {
            shell: false,
            cwd: runCwd,
            windowsHide: true,
          },
        )
      : spawn(command, {
          shell: true,
          cwd: runCwd,
          windowsHide: true,
        });

    let stdout = "";
    let stderr = "";
    let killed = false;
    const maxBytes = 500 * 1024; // 500 KB max

    proc.stdout.on("data", (chunk) => {
      if (Buffer.byteLength(stdout, "utf8") < maxBytes) {
        stdout += String(chunk);
        if (Buffer.byteLength(stdout, "utf8") > maxBytes)
          stdout = stdout.slice(0, maxBytes) + "\n...[truncated]";
      }
    });
    proc.stderr.on("data", (chunk) => {
      if (Buffer.byteLength(stderr, "utf8") < maxBytes) {
        stderr += String(chunk);
        if (Buffer.byteLength(stderr, "utf8") > maxBytes)
          stderr = stderr.slice(0, maxBytes) + "\n...[truncated]";
      }
    });

    // If input provided, write and end
    if (input) {
      try {
        proc.stdin.write(String(input));
      } catch (e) {}
      try {
        proc.stdin.end();
      } catch (e) {}
    }

    const timeout = setTimeout(
      () => {
        try {
          killed = true;
          proc.kill("SIGKILL");
        } catch (e) {}
      },
      Number(timeoutMs) || 10000,
    );

    proc.on("close", (code, signal) => {
      clearTimeout(timeout);
      res.json({
        success: true,
        stdout,
        stderr,
        code,
        signal,
        timedOut: killed,
      });
    });
    proc.on("error", (err) => {
      clearTimeout(timeout);
      console.error("Exec error:", err);
      res.status(500).json({
        error: "Execution failed",
        message: err?.message || String(err),
      });
    });
  } catch (err) {
    console.error("Exec endpoint error:", err);
    res
      .status(500)
      .json({ error: "Unable to execute command", details: err.message });
  }
});

// --------------------
// Dependency resolver / auto-installer (safe, opt-in)
// Scans provided source (or project files) for imports/requires and attempts to install
// minimal packages into the project workspace. This is gated behind ALLOW_DEP_INSTALL.
// Request body: { language: 'javascript'|'python'|'auto', source?: string, scanProject?: boolean }
app.post("/api/resolve-dependencies", async (req, res) => {
  try {
    // allow detection (dry run) even when install is disabled; installing requires ALLOW_DEP_INSTALL=true
    const allowInstall =
      String(process.env.ALLOW_DEP_INSTALL || "").toLowerCase() === "true";
    const {
      language = "auto",
      source = "",
      scanProject = false,
      dryRun = true,
      action = "detect",
    } = req.body || {};

    if (action === "install" && !allowInstall) {
      return res
        .status(403)
        .json({ error: "Dependency install disabled on this server" });
    }
    const projectRoot = SERVER_PROJECT_ROOT || path.join(__dirname, "..");

    // Helper: find JS/TS packages from source text
    const detectNodePackages = (text) => {
      const pkgs = new Set();
      if (!text) return [];
      // import ... from 'pkg'  or require('pkg') or require("pkg")
      const reImport = /import\s+(?:[\s\S]+?)from\s+['"]([^'"@][^'"\/]*)['"]/g;
      const reImportScoped =
        /import\s+(?:[\s\S]+?)from\s+['"](@[^'"/]+\/[^'"/]+)['"]/g;
      const reRequire = /require\(\s*['"]([^'"@][^'"\/]*)['"]\s*\)/g;
      const reRequireScoped = /require\(\s*['"](@[^'"/]+\/[^'"/]+)['"]\s*\)/g;

      let m;
      while ((m = reImportScoped.exec(text))) pkgs.add(m[1]);
      while ((m = reImport.exec(text))) pkgs.add(m[1]);
      while ((m = reRequireScoped.exec(text))) pkgs.add(m[1]);
      while ((m = reRequire.exec(text))) pkgs.add(m[1]);

      // also scan for `from 'pkg/subpath'` and trim to package name
      const normalized = new Set();
      for (const p of pkgs) {
        const parts = p.split("/");
        if (p.startsWith("@")) normalized.add(parts.slice(0, 2).join("/"));
        else normalized.add(parts[0]);
      }
      return Array.from(normalized);
    };

    // Helper: detect python top-level imports (very approximate)
    const detectPythonPackages = (text) => {
      const pkgs = new Set();
      if (!text) return [];
      const reFrom = /from\s+([a-zA-Z0-9_\.]+)\s+import/g;
      const reImport = /import\s+([a-zA-Z0-9_\.]+)/g;
      let m;
      while ((m = reFrom.exec(text))) {
        const top = m[1].split(".")[0];
        if (top && !top.startsWith("_")) pkgs.add(top);
      }
      while ((m = reImport.exec(text))) {
        const top = m[1].split(".")[0];
        if (top && !top.startsWith("_")) pkgs.add(top);
      }
      return Array.from(pkgs).filter(
        (p) =>
          ![
            "os",
            "sys",
            "re",
            "typing",
            "math",
            "json",
            "pathlib",
            "itertools",
            "collections",
          ].includes(p),
      );
    };

    // Gather candidate files/text to scan
    const candidates = [];
    if (source && typeof source === "string" && source.trim())
      candidates.push(source);
    if (scanProject) {
      // read common files: package.json, package-lock.json, pyproject.toml, requirements.txt, and a few source files
      try {
        const pj = path.join(projectRoot, "package.json");
        if (fs.existsSync(pj)) {
          const pjRaw = fs.readFileSync(pj, "utf-8");
          candidates.push(pjRaw);
        }
        const req = path.join(projectRoot, "requirements.txt");
        if (fs.existsSync(req)) candidates.push(fs.readFileSync(req, "utf-8"));
        const pyproj = path.join(projectRoot, "pyproject.toml");
        if (fs.existsSync(pyproj))
          candidates.push(fs.readFileSync(pyproj, "utf-8"));

        // quick scan: pick up to 50 .js/.ts/.py files under project root
        const walk = (dir, depth = 0) => {
          if (depth > 6) return;
          let entries = [];
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
          } catch (e) {
            return;
          }
          for (const e of entries) {
            if (e.name === "node_modules" || e.name === ".git") continue;
            const full = path.join(dir, e.name);
            try {
              if (e.isDirectory()) walk(full, depth + 1);
              else if (e.isFile()) {
                const ext = path.extname(e.name).toLowerCase();
                if ([".js", ".ts", ".jsx", ".tsx", ".py"].includes(ext)) {
                  try {
                    const txt = fs.readFileSync(full, "utf-8");
                    candidates.push(txt);
                  } catch (e) {}
                  if (candidates.length > 200) return;
                }
              }
            } catch (e) {}
          }
        };
        walk(projectRoot, 0);
      } catch (e) {}
    }

    // Detect packages based on language hint
    let nodePkgs = [];
    let pyPkgs = [];
    if (
      language === "auto" ||
      language === "javascript" ||
      language === "typescript"
    ) {
      for (const t of candidates) nodePkgs.push(...detectNodePackages(t));
      // also include deps from package.json
      try {
        const pj = path.join(projectRoot, "package.json");
        if (fs.existsSync(pj)) {
          const pjObj = JSON.parse(fs.readFileSync(pj, "utf-8"));
          const deps = Object.keys(pjObj.dependencies || {}).concat(
            Object.keys(pjObj.devDependencies || {}),
          );
          nodePkgs.push(...deps);
        }
      } catch (e) {}
    }
    if (language === "auto" || language === "python") {
      for (const t of candidates) pyPkgs.push(...detectPythonPackages(t));
      // include requirements.txt
      try {
        const req = path.join(projectRoot, "requirements.txt");
        if (fs.existsSync(req)) {
          const lines = fs
            .readFileSync(req, "utf-8")
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          pyPkgs.push(...lines.map((l) => l.split(/[=<>~]/)[0] || l));
        }
      } catch (e) {}
    }

    nodePkgs = Array.from(new Set(nodePkgs)).filter(Boolean);
    pyPkgs = Array.from(new Set(pyPkgs)).filter(Boolean);

    const installResults = {
      node: null,
      python: null,
      detected: { node: nodePkgs, python: pyPkgs },
    };

    // Short-circuit: detection-only
    if (dryRun || action !== "install") {
      return res.json({ success: true, installResults });
    }

    // Install Node packages with npm install --no-audit --no-fund --no-package-lock --prefer-offline
    const execCmd = (cmd, opts = {}) =>
      new Promise((resolve) => {
        const { spawn } = require("child_process");
        const p = spawn(cmd, {
          shell: true,
          cwd: projectRoot,
          windowsHide: true,
          ...opts,
        });
        let out = "";
        let err = "";
        const max = 1024 * 1024; // 1MB
        p.stdout.on("data", (c) => {
          out += String(c);
          if (out.length > max) out = out.slice(-max);
        });
        p.stderr.on("data", (c) => {
          err += String(c);
          if (err.length > max) err = err.slice(-max);
        });
        const to = setTimeout(() => {
          try {
            p.kill("SIGKILL");
          } catch (e) {}
        }, 120000);
        p.on("close", (code) => {
          clearTimeout(to);
          resolve({ code, stdout: out, stderr: err });
        });
        p.on("error", (e) => {
          clearTimeout(to);
          resolve({ code: 1, stdout: out, stderr: String(e) });
        });
      });

    // Only attempt installs if we detected packages
    if (nodePkgs.length > 0) {
      // Prefer to add to package.json via `npm i pkg@latest --no-save`? We'll use npm install --no-audit --no-fund
      // Use --no-save to avoid modifying package.json by default
      const safeList = nodePkgs
        .slice(0, 30)
        .map((p) => p.replace(/[^a-zA-Z0-9@\-\/_\.]/g, ""));
      if (safeList.length) {
        const cmd = `npm install --no-audit --no-fund --no-save ${safeList.join(" ")}`;
        installResults.node = await execCmd(cmd);
      }
    }

    if (pyPkgs.length > 0) {
      // Install into project root under .venv-packages or use pip --target
      const safeList = pyPkgs
        .slice(0, 30)
        .map((p) => p.replace(/[^a-zA-Z0-9_\-\.]/g, ""));
      if (safeList.length) {
        const target = path.join(projectRoot, ".venv-packages");
        try {
          if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
        } catch (e) {}
        const cmd = `python -m pip install --upgrade --target "${target}" ${safeList.join(" ")}`;
        installResults.python = await execCmd(cmd);
      }
    }

    res.json({ success: true, installResults });
  } catch (err) {
    console.error("Resolve-dependencies error:", err);
    res.status(500).json({
      error: "Unable to resolve dependencies",
      details: err?.message || String(err),
    });
  }
});

app.get("/api/project-structure", (_req, res) => {
  try {
    // Return the client folder structure (or project root, depending on your setup)
    const projectRoot = SERVER_PROJECT_ROOT;
    const structure = getProjectStructure(projectRoot, 4, 0, [
      "node_modules",
      ".git",
      "dist",
      "build",
      ".env",
      ".DS_Store",
    ]);

    // Filter out default/system files - ONLY show user-created items
    const defaultItems = new Set([
      "client",
      "server",
      "node_modules",
      "dist",
      ".git",
      ".env",
      "package.json",
      "package-lock.json",
      "docker-compose.yml",
      "judge0.conf",
      "README.md",
      "typing.js",
      "main.js",
      "msmain.js",
      "mainain.js",
      "msain.js",
      "name.c",
      "name.js",
      "nag.c",
      "nag.cjal.c",
      "ritik.js",
      "vite.config.js",
      "index.html",
      "vite.svg",
      ".gitignore",
      ".env.local",
      "eslint.config.js",
      "postcss.config.js",
      "tailwind.config.js",
      "tsconfig.json",
      "tsconfig.app.json",
      ".vscode",
      "src",
      "public",
      "lib",
      "services",
      "store",
      "styles",
      "assets",
      "components",
    ]);

    // Filter structure recursively to remove default items only at the top level
    const filterStructure = (items, depth = 0) => {
      if (!items) return [];
      return items
        .filter((item) => {
          // Only hide default items at the root level (depth === 0).
          if (depth === 0 && defaultItems.has(item.name)) return false;
          return true;
        })
        .map((item) => ({
          ...item,
          children: item.children
            ? filterStructure(item.children, depth + 1)
            : undefined,
        }));
    };

    const filtered = filterStructure(structure, 0);
    res.json({ structure: filtered });
  } catch (err) {
    console.error("Project structure error:", err);
    res.status(500).json({ error: "Unable to fetch project structure" });
  }
});

// --------------------
// Settings endpoints (get/set project root)
// --------------------
app.get("/api/settings", (req, res) => {
  try {
    res.json({ projectRoot: SERVER_PROJECT_ROOT });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Unable to read settings", details: err.message });
  }
});

app.post("/api/settings/root", (req, res) => {
  try {
    const { rootPath } = req.body || {};
    if (!rootPath || typeof rootPath !== "string")
      return res.status(400).json({ error: "rootPath is required" });

    const resolved = path.resolve(rootPath);
    // Ensure the path exists and is a directory
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return res.status(400).json({
        error: "rootPath does not exist or is not a directory",
        path: resolved,
      });
    }

    SERVER_PROJECT_ROOT = resolved;
    console.log("🔧 Project root changed to:", SERVER_PROJECT_ROOT);
    res.json({ success: true, projectRoot: SERVER_PROJECT_ROOT });
  } catch (err) {
    console.error("Set root error:", err);
    res.status(500).json({ error: "Unable to set root", details: err.message });
  }
});

// --------------------
// Start server
// --------------------
await connectDB();
const server = app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server listening on http://127.0.0.1:${PORT}`),
);

// --------------------
// WebSocket for simple collaboration (subscribe/edit broadcast)
// --------------------
const wss = new WebSocketServer({ server, path: "/ws" });

// filePath -> Set of ws clients
const fileSubscriptions = new Map();

function subscribeClientToFile(ws, filePath) {
  if (!filePath) return;
  let set = fileSubscriptions.get(filePath);
  if (!set) {
    set = new Set();
    fileSubscriptions.set(filePath, set);
  }
  set.add(ws);
  ws.subscriptions = ws.subscriptions || new Set();
  ws.subscriptions.add(filePath);
}

function unsubscribeClientFromFile(ws, filePath) {
  const set = fileSubscriptions.get(filePath);
  if (set) {
    set.delete(ws);
    if (set.size === 0) fileSubscriptions.delete(filePath);
  }
  if (ws.subscriptions) ws.subscriptions.delete(filePath);
}

function broadcastToFile(filePath, payload, exceptWs) {
  const set = fileSubscriptions.get(filePath);
  if (!set) return;
  const msg = JSON.stringify(payload);
  for (const client of set) {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      try {
        client.send(msg);
      } catch (e) {}
    }
  }
}

wss.on("connection", (ws, req) => {
  // assign a lightweight id
  ws.clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  ws.subscriptions = new Set();

  ws.on("message", (raw) => {
    let data = null;
    try {
      data = JSON.parse(String(raw));
    } catch (e) {
      return;
    }
    const { type } = data || {};
    if (type === "subscribe") {
      const { filePath } = data;
      subscribeClientToFile(ws, filePath);
    } else if (type === "unsubscribe") {
      const { filePath } = data;
      unsubscribeClientFromFile(ws, filePath);
    } else if (type === "edit") {
      const { filePath, content, clientId, timestamp } = data;
      // Broadcast to other clients subscribed to this file
      broadcastToFile(
        filePath,
        { type: "edit", filePath, content, clientId, timestamp },
        ws,
      );
    }
  });

  ws.on("close", () => {
    // clean up subscriptions
    if (ws.subscriptions) {
      for (const filePath of ws.subscriptions) {
        unsubscribeClientFromFile(ws, filePath);
      }
    }
  });
});

// nbjkdkjkakd
