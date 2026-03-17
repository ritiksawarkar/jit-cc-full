export function requireRole(...roles) {
  const allowed = roles.map((r) => String(r || "").toLowerCase());

  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();
    if (allowed.includes(role)) {
      return next();
    }

    return res.status(403).json({ error: "Forbidden: insufficient role" });
  };
}
