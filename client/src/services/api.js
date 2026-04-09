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

export async function submitCode({
  userId,
  problemId,
  eventId,
  language,
  language_id,
  sourceCode,
  input,
}) {
  const res = await API.post("/api/submissions", {
    userId,
    problemId,
    eventId,
    language,
    language_id,
    sourceCode,
    input,
  });
  return res.data;
}

export async function fetchUserSubmissions(userId) {
  const res = await API.get(
    `/api/submissions/user/${encodeURIComponent(userId)}`,
  );
  return res.data;
}

export async function fetchSubmissionsByProblem(problemId, userId) {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const res = await API.get(
    `/api/submissions/problem/${encodeURIComponent(problemId)}${params}`,
  );
  return res.data;
}

export async function fetchSubmissionById(submissionId) {
  const res = await API.get(
    `/api/submissions/${encodeURIComponent(submissionId)}`,
  );
  return res.data;
}

export async function reevaluateSubmission(submissionId) {
  const res = await API.post(
    `/api/submissions/${encodeURIComponent(submissionId)}/reevaluate`,
  );
  return res.data;
}

export async function fetchProblems(
  includeInactive = false,
  page = 1,
  limit = 20,
  eventId = "",
  includeExpired = false,
) {
  const params = new URLSearchParams();
  if (includeInactive) params.append("includeInactive", "true");
  if (includeExpired) params.append("includeExpired", "true");
  params.append("page", String(page));
  params.append("limit", String(limit));
  if (eventId) params.append("eventId", String(eventId));
  const query = params.toString();
  const res = await API.get(`/api/problems?${query}`);
  return res.data;
}

export async function fetchAllProblemsForAdmin(
  page = 1,
  limit = 20,
  eventId = "",
) {
  const params = new URLSearchParams();
  params.append("page", String(page));
  params.append("limit", String(limit));
  if (eventId) params.append("eventId", String(eventId));
  const query = params.toString();
  const res = await API.get(`/api/problems/all?${query}`);
  return res.data;
}

export async function fetchProblemById(problemId) {
  const res = await API.get(`/api/problems/${encodeURIComponent(problemId)}`);
  return res.data;
}

export async function getMyProblemSelection(eventId) {
  const res = await API.get(
    `/api/events/${encodeURIComponent(eventId)}/problems/my-selection`,
  );
  return res.data;
}

export async function lockMyProblemSelection(eventId, problemId) {
  const res = await API.post(
    `/api/events/${encodeURIComponent(eventId)}/problems/my-selection`,
    { problemId },
  );
  return res.data;
}

export async function unlockMyProblemSelection(eventId) {
  const res = await API.delete(
    `/api/events/${encodeURIComponent(eventId)}/problems/my-selection`,
  );
  return res.data;
}

export async function joinEventWithCode(eventCode) {
  const res = await API.post("/api/events/join", { eventCode });
  return res.data;
}

export async function fetchMyEvents() {
  const res = await API.get("/api/events/my");
  return res.data;
}

export async function fetchEvents() {
  const res = await API.get("/api/events");
  return res.data;
}

export async function updateEventStatus(eventId, status) {
  const res = await API.patch(
    `/api/events/${encodeURIComponent(eventId)}/status`,
    {
      status,
    },
  );
  return res.data;
}

export async function fetchEventById(eventId) {
  const res = await API.get(`/api/events/${encodeURIComponent(eventId)}`);
  return res.data;
}

export async function fetchEventProblems(eventId) {
  const res = await API.get(
    `/api/events/${encodeURIComponent(eventId)}/problems`,
  );
  return res.data;
}

export async function createProblem(payload) {
  const res = await API.post("/api/admin/problems", payload);
  return res.data;
}

export async function updateProblem(problemId, payload) {
  const res = await API.put(
    `/api/admin/problems/${encodeURIComponent(problemId)}`,
    payload,
  );
  return res.data;
}

export async function archiveProblem(problemId) {
  const res = await API.delete(
    `/api/admin/problems/${encodeURIComponent(problemId)}`,
  );
  return res.data;
}

export async function bulkImportProblems(problems, conflictMode = "skip") {
  const res = await API.post("/api/admin/problems/bulk/import", {
    problems,
    conflictMode,
  });
  return res.data;
}

export async function fetchAdminOverview() {
  const res = await API.get("/api/admin/overview");
  return res.data;
}

export async function fetchAdminEvents(scope = "all") {
  const res = await API.get(
    `/api/admin/events?scope=${encodeURIComponent(scope)}`,
  );
  return res.data;
}

export async function createAdminEvent(payload) {
  const res = await API.post("/api/admin/events", payload);
  return res.data;
}

export async function updateAdminEvent(eventId, payload) {
  const res = await API.put(
    `/api/admin/events/${encodeURIComponent(eventId)}`,
    payload,
  );
  return res.data;
}

export async function deleteAdminEvent(eventId) {
  const res = await API.delete(
    `/api/admin/events/${encodeURIComponent(eventId)}`,
  );
  return res.data;
}

export async function fetchEventAttendanceSummary() {
  const res = await API.get("/api/admin/events/attendance/summary");
  return res.data;
}

export async function upsertEventAttendance(eventId, payload) {
  const res = await API.put(
    `/api/admin/events/${encodeURIComponent(eventId)}/attendance`,
    payload,
  );
  return res.data;
}

export async function bulkUpsertEventAttendance(rows) {
  const res = await API.post("/api/admin/events/attendance/bulk", { rows });
  return res.data;
}

export async function fetchAdminStudents() {
  const res = await API.get("/api/admin/students");
  return res.data;
}

export async function setStudentFreeze(userId, frozen, reason = "") {
  const res = await API.put(
    `/api/admin/students/${encodeURIComponent(userId)}/freeze`,
    { frozen, reason },
  );
  return res.data;
}

export async function forceStudentPasswordReset(userId) {
  const res = await API.post(
    `/api/admin/students/${encodeURIComponent(userId)}/force-password-reset`,
  );
  return res.data;
}

export async function fetchAdminAuditLogs(limit = 50) {
  const res = await API.get(
    `/api/admin/audit-logs?limit=${encodeURIComponent(limit)}`,
  );
  return res.data;
}

export async function fetchAdminEventResults(eventId) {
  const res = await API.get(
    `/api/admin/events/${encodeURIComponent(eventId)}/results`,
  );
  return res.data;
}

export async function computeAdminEventResults(eventId) {
  const res = await API.post(
    `/api/admin/events/${encodeURIComponent(eventId)}/results/compute`,
  );
  return res.data;
}

export async function finalizeAdminEventResults(eventId) {
  const res = await API.post(
    `/api/admin/events/${encodeURIComponent(eventId)}/results/finalize`,
  );
  return res.data;
}

export async function fetchAdminEventProblemSelections(
  eventId,
  page = 1,
  limit = 20,
) {
  const res = await API.get(
    `/api/admin/events/${encodeURIComponent(eventId)}/problem-selections?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`,
  );
  return res.data;
}

export async function adminUnlockEventProblemSelection(
  eventId,
  userId,
  reason,
) {
  const res = await API.put(
    `/api/admin/events/${encodeURIComponent(eventId)}/problem-selections/${encodeURIComponent(userId)}/unlock`,
    { reason },
  );
  return res.data;
}

export async function fetchPublicEventLeaderboard(eventId) {
  const res = await API.get(
    `/api/events/${encodeURIComponent(eventId)}/leaderboard`,
  );
  return res.data;
}

export async function createEventPrize(eventId, payload) {
  const res = await API.post(
    `/api/admin/events/${encodeURIComponent(eventId)}/prizes`,
    payload,
  );
  return res.data;
}

export async function fetchEventPrizes(eventId) {
  const res = await API.get(
    `/api/admin/events/${encodeURIComponent(eventId)}/prizes`,
  );
  return res.data;
}

export async function updateEventPrize(prizeId, payload) {
  const res = await API.put(
    `/api/admin/prizes/${encodeURIComponent(prizeId)}`,
    payload,
  );
  return res.data;
}

export async function archiveEventPrize(prizeId) {
  const res = await API.delete(
    `/api/admin/prizes/${encodeURIComponent(prizeId)}`,
  );
  return res.data;
}

export async function allocateEventPrizes(eventId) {
  const res = await API.post(
    `/api/admin/events/${encodeURIComponent(eventId)}/prizes/allocate`,
  );
  return res.data;
}

export async function fetchEventPrizeAllocations(eventId) {
  const res = await API.get(
    `/api/admin/events/${encodeURIComponent(eventId)}/prizes/allocations`,
  );
  return res.data;
}

export async function deliverPrizeAllocation(allocationId, payload = {}) {
  const res = await API.post(
    `/api/admin/prize-allocations/${encodeURIComponent(allocationId)}/deliver`,
    payload,
  );
  return res.data;
}

export async function fetchMyPrizes() {
  const res = await API.get("/api/rewards/my-prizes");
  return res.data;
}

export async function claimPrizeAllocation(allocationId, claimDetails) {
  const res = await API.post(
    `/api/rewards/allocations/${encodeURIComponent(allocationId)}/claim`,
    { claimDetails },
  );
  return res.data;
}

export async function createCertificateTemplate(eventId, payload) {
  const res = await API.post(
    `/api/certificates/admin/events/${encodeURIComponent(eventId)}/templates`,
    payload,
  );
  return res.data;
}

export async function fetchCertificateTemplates(eventId) {
  const res = await API.get(
    `/api/certificates/admin/events/${encodeURIComponent(eventId)}/templates`,
  );
  return res.data;
}

export async function updateCertificateTemplate(templateId, payload) {
  const res = await API.put(
    `/api/certificates/admin/templates/${encodeURIComponent(templateId)}`,
    payload,
  );
  return res.data;
}

export async function issueEventCertificates(eventId, payload = {}) {
  const res = await API.post(
    `/api/certificates/admin/events/${encodeURIComponent(eventId)}/issue`,
    payload,
  );
  return res.data;
}

export async function fetchEventCertificates(eventId) {
  const res = await API.get(
    `/api/certificates/admin/events/${encodeURIComponent(eventId)}`,
  );
  return res.data;
}

export async function fetchMyCertificates() {
  const res = await API.get("/api/certificates/my");
  return res.data;
}

export async function verifyCertificate(verificationCode) {
  const res = await API.get(
    `/api/certificates/verify/${encodeURIComponent(verificationCode)}`,
  );
  return res.data;
}

export async function fetchPublicCertificateAssets() {
  const res = await API.get("/api/certificates/assets");
  return res.data;
}

export async function fetchAdminCertificateAssets() {
  const res = await API.get("/api/admin/certificate-assets");
  return res.data;
}

export async function uploadAdminCertificateAsset(key, payload) {
  const res = await API.put(
    `/api/admin/certificate-assets/${encodeURIComponent(key)}`,
    payload,
  );
  return res.data;
}

export async function resetAdminCertificateAssets() {
  const res = await API.post("/api/admin/certificate-assets/reset");
  return res.data;
}

// AI function with improved response for GitHub Copilot-like behavior
export async function getAISuggestions(prompt, options = {}) {
  try {
    const payload = {
      code: prompt,
      ...(options?.mode ? { mode: options.mode } : {}),
      ...(options?.language ? { language: options.language } : {}),
    };
    const res = await API.post("/api/ai-suggestions", payload);
    return res.data;
  } catch (err) {
    // Normalize axios cancelation / error objects so caller gets a clear Error
    if (err && err.__CANCEL__) {
      const cancelError = new Error(err.message || "request canceled");
      cancelError.type = "cancelation";
      cancelError.code = "ERR_CANCELED";
      cancelError.msg = err.message || "operation is manually canceled";
      throw cancelError;
    }
    // Re-throw a simple Error where possible
    const message =
      err?.response?.data?.error || err.message || JSON.stringify(err);
    throw new Error(message);
  }
}

// Explain an error or compile output using the AI endpoint. The server expects
// { code: prompt } and returns { suggestions: string }.
export async function explainError({
  language,
  stderr,
  compile_output,
  context,
}) {
  const promptParts = [];
  if (language) promptParts.push(`Language: ${language}`);
  if (stderr) promptParts.push(`Stderr:\n${stderr}`);
  if (compile_output) promptParts.push(`Compile Output:\n${compile_output}`);
  if (context) promptParts.push(`Context:\n${context}`);
  const prompt = promptParts.join("\n\n");
  try {
    const res = await API.post("/api/ai-suggestions", {
      code: prompt,
      mode: "with-explanation",
      language: String(language || ""),
    });
    return res.data;
  } catch (err) {
    const message =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Unable to explain the error right now";
    throw new Error(message);
  }
}

export async function loginWithEmail({ email, password }) {
  const res = await API.post("/api/auth/login", { email, password });
  return res.data;
}

export async function signupWithEmail({ name, email, password, role }) {
  const res = await API.post("/api/auth/signup", {
    name,
    email,
    password,
    role,
  });
  return res.data;
}

export async function requestPasswordReset(email) {
  const res = await API.post("/api/auth/forgot-password", { email });
  return res.data;
}

export async function resetPasswordWithToken({ token, email, newPassword }) {
  const res = await API.post("/api/auth/reset-password", {
    token,
    email,
    newPassword,
  });
  return res.data;
}

export async function fetchLeaderboard(limit = 20) {
  const res = await API.get(
    `/api/leaderboard?limit=${encodeURIComponent(limit)}`,
  );
  return res.data;
}

export async function getSettings() {
  const res = await API.get("/api/settings");
  return res.data;
}

export async function setProjectRoot(rootPath) {
  const res = await API.post("/api/settings/root", { rootPath });
  return res.data;
}

export async function submitScore(score) {
  const res = await API.post(`/api/leaderboard`, { score });
  return res.data;
}

export async function getProjectStructure() {
  const res = await API.get("/api/project-structure");
  return res.data;
}

export async function readFile(filePath) {
  const res = await API.post("/api/read-file", { filePath });
  return res.data;
}

export async function saveFile(filePath, content) {
  const res = await API.put("/api/save-file", { filePath, content });
  return res.data;
}

export async function deleteFile(filePath) {
  const encode = (s) => {
    // Browser-safe base64 encoding (handles UTF-8)
    if (typeof window !== "undefined" && typeof window.btoa === "function") {
      return window.btoa(unescape(encodeURIComponent(s)));
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(s).toString("base64");
    }
    throw new Error("No base64 encoder available");
  };
  const encodedPath = encode(filePath);
  const res = await API.delete(`/api/files/${encodeURIComponent(encodedPath)}`);
  return res.data;
}

export async function renameFile(oldPath, newName) {
  const encode = (s) => {
    if (typeof window !== "undefined" && typeof window.btoa === "function") {
      return window.btoa(unescape(encodeURIComponent(s)));
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(s).toString("base64");
    }
    throw new Error("No base64 encoder available");
  };
  const encodedPath = encode(oldPath);
  const res = await API.put(
    `/api/files/rename/${encodeURIComponent(encodedPath)}`,
    { newName },
  );
  return res.data;
}

export async function createFile(filePath, content = "") {
  const res = await API.post("/api/files/create", { filePath, content });
  return res.data;
}

export async function createFolder(folderPath) {
  const res = await API.post(`/api/folders/create`, { folderPath });
  return res.data;
}

export async function execCommand({ command, cwd, input, timeoutMs } = {}) {
  const res = await API.post(`/api/exec`, { command, cwd, input, timeoutMs });
  return res.data;
}

export async function resolveDependencies({
  language = "auto",
  source = "",
  scanProject = false,
  dryRun = true,
  action = "detect",
} = {}) {
  const res = await API.post("/api/resolve-dependencies", {
    language,
    source,
    scanProject,
    dryRun,
    action,
  });
  return res.data;
}

export async function searchFiles(query, maxResults = 50) {
  const res = await API.post("/api/search", { query, maxResults });
  return res.data;
}

// ========== NOTIFICATION ENDPOINTS ==========

/**
 * Get all notifications for current student
 */
export async function getMyNotifications(
  type = null,
  isRead = null,
  priority = null,
) {
  const params = new URLSearchParams();
  if (type) params.append("type", type);
  if (isRead !== null) params.append("isRead", String(isRead));
  if (priority) params.append("priority", priority);

  const res = await API.get(
    `/api/notifications${params.toString() ? "?" + params.toString() : ""}`,
  );
  return res.data;
}

/**
 * Get notification summary (badge counts)
 */
export async function getNotificationSummary() {
  const res = await API.get("/api/notifications/summary");
  return res.data;
}

/**
 * Mark single notification as read
 */
export async function markNotificationAsRead(notificationId) {
  const res = await API.put(`/api/notifications/${notificationId}/read`);
  return res.data;
}

/**
 * Mark multiple notifications as read
 */
export async function markAllNotificationsAsRead(notificationIds) {
  const res = await API.put("/api/notifications/read-all", { notificationIds });
  return res.data;
}

/**
 * Archive a notification
 */
export async function archiveNotification(notificationId) {
  const res = await API.put(`/api/notifications/${notificationId}/archive`);
  return res.data;
}

/**
 * Archive all read notifications
 */
export async function archiveAllReadNotifications() {
  const res = await API.put("/api/notifications/archive-all");
  return res.data;
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId) {
  const res = await API.delete(`/api/notifications/${notificationId}`);
  return res.data;
}

/**
 * Pin a notification
 */
export async function pinNotification(notificationId) {
  const res = await API.put(`/api/notifications/${notificationId}/pin`);
  return res.data;
}

/**
 * Admin: Create and send notifications
 */
export async function createNotification(payload) {
  const res = await API.post("/api/notifications/create", payload);
  return res.data;
}
