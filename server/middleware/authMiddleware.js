import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization required" });
    }

    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.AUTH_JWT_SECRET);
    req.user = payload;
    return next();
  } catch (_err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function allowSelfOrAdmin(paramKey = "userId") {
  return (req, res, next) => {
    const authUserId = String(req.user?.sub || "");
    const role = String(req.user?.role || "student");
    const targetUserId = String(req.params?.[paramKey] || req.query?.[paramKey] || "");

    if (role === "admin" || !targetUserId || targetUserId === authUserId) {
      return next();
    }

    return res.status(403).json({ error: "Forbidden" });
  };
}
