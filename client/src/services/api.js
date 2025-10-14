import axios from "axios";

// Explicitly point to backend during dev
const base = import.meta.env.PROD
  ? import.meta.env.VITE_API_URL || "http://127.0.0.1:9009"
  : "http://127.0.0.1:9009"; // <-- backend Express server

export const API = axios.create({ baseURL: base });

API.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("esm-compiler-session");
      if (raw) {
        const { token } = JSON.parse(raw);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch {
      // ignore malformed session data
    }
  }
  return config;
});

// Existing execute function
export async function executeCode({ language_id, source_code, stdin }) {
  const res = await API.post("/api/execute", {
    language_id,
    source_code,
    stdin,
  });
  return res.data;
}

// AI function with improved response for GitHub Copilot-like behavior
export async function getAISuggestions(prompt) {
  const res = await API.post("/api/ai-suggestions", { code: prompt });
  return res.data;
}

// Explain an error or compile output using the AI endpoint. The server expects
// { code: prompt } and returns { suggestions: string }.
export async function explainError({ language, stderr, compile_output, context }) {
  const promptParts = [];
  if (language) promptParts.push(`Language: ${language}`);
  if (stderr) promptParts.push(`Stderr:\n${stderr}`);
  if (compile_output) promptParts.push(`Compile Output:\n${compile_output}`);
  if (context) promptParts.push(`Context:\n${context}`);
  const prompt = promptParts.join("\n\n");
  const res = await API.post("/api/ai-suggestions", { code: prompt });
  return res.data;
}

export async function loginWithEmail({ email, password }) {
  const res = await API.post("/api/auth/login", { email, password });
  return res.data;
}

export async function signupWithEmail({ name, email, password }) {
  const res = await API.post("/api/auth/signup", { name, email, password });
  return res.data;
}

export async function fetchLeaderboard(limit = 20) {
  const res = await API.get(`/api/leaderboard?limit=${encodeURIComponent(limit)}`);
  return res.data;
}

export async function submitScore(score) {
  const res = await API.post(`/api/leaderboard`, { score });
  return res.data;
}
