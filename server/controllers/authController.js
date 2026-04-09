import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import User from "../models/User.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

function getSmtpConfig() {
  const portValue = Number(process.env.SMTP_PORT || 587);
  return {
    enabled: parseBooleanEnv(process.env.SMTP_ENABLED, true),
    host: String(process.env.SMTP_HOST || "").trim(),
    port: Number.isFinite(portValue) && portValue > 0 ? portValue : 587,
    secure: parseBooleanEnv(process.env.SMTP_SECURE, false),
    user: String(process.env.SMTP_USER || "").trim(),
    pass: String(process.env.SMTP_PASS || ""),
    from: String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim(),
  };
}

function isSmtpReady(config) {
  if (!config?.enabled) return false;
  return Boolean(
    config.host && config.port && config.user && config.pass && config.from,
  );
}

async function sendPasswordResetEmail({ to, name, resetUrl, expiresAt }) {
  const smtp = getSmtpConfig();
  if (!isSmtpReady(smtp)) {
    return { emailed: false, reason: "smtp_not_configured" };
  }

  try {
    const { default: nodemailer } = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    const expiresText = (() => {
      try {
        return new Date(expiresAt).toLocaleString();
      } catch {
        return String(expiresAt || "");
      }
    })();

    await transporter.sendMail({
      from: smtp.from,
      to,
      subject: "Password Reset Request",
      text: [
        `Hi ${name || "there"},`,
        "",
        "We received a request to reset your password.",
        `Reset link: ${resetUrl}`,
        `This link expires at: ${expiresText}`,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
      html: [
        `<p>Hi ${name || "there"},</p>`,
        "<p>We received a request to reset your password.</p>",
        `<p><a href=\"${resetUrl}\">Click here to reset your password</a></p>`,
        `<p>This link expires at: <strong>${expiresText}</strong></p>`,
        "<p>If you did not request this, you can ignore this email.</p>",
      ].join(""),
    });

    return { emailed: true };
  } catch (err) {
    console.error("sendPasswordResetEmail error:", err);
    return { emailed: false, reason: "smtp_send_failed" };
  }
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      userId: user.id,
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
    isFrozen: Boolean(user.isFrozen),
    mustResetPassword: Boolean(user.mustResetPassword),
    createdAt: user.createdAt,
  };
}

function generatePasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function buildClientResetUrl(token, email) {
  const baseUrl =
    process.env.CLIENT_BASE_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_BASE_URL ||
    "http://127.0.0.1:5173";

  try {
    const url = new URL("/reset-password", baseUrl);
    url.searchParams.set("token", token);
    if (email) {
      url.searchParams.set("email", email);
    }
    return url.toString();
  } catch {
    const encodedToken = encodeURIComponent(token);
    const encodedEmail = encodeURIComponent(email || "");
    return `${String(baseUrl || "").replace(/\/$/, "")}/reset-password?token=${encodedToken}&email=${encodedEmail}`;
  }
}

// POST /api/auth/register  (also aliased to /api/auth/signup)
export async function register(req, res) {
  try {
    const { name, email, password, role } = req.body || {};

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

    const normalizedRole = ["student", "admin"].includes(
      String(role || "student").toLowerCase(),
    )
      ? String(role || "student").toLowerCase()
      : "student";

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const user = await User.create({
      name: String(name).trim().slice(0, 80),
      email: normalizedEmail,
      password: String(password),
      role: normalizedRole,
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

    if (user.isFrozen) {
      return res.status(403).json({
        error: "Account is frozen",
        message:
          user.frozenReason ||
          "Please contact admin to reactivate your account",
      });
    }

    if (user.mustResetPassword) {
      return res.status(403).json({
        error: "Password reset required",
        code: "PASSWORD_RESET_REQUIRED",
        message: "Please reset your password before signing in.",
      });
    }

    const isMatch = await user.comparePassword(String(password));
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

// POST /api/auth/forgot-password
export async function forgotPassword(req, res) {
  try {
    const rawEmail = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    if (!EMAIL_RE.test(rawEmail)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }

    const genericMessage =
      "If an account exists with this email, a password reset link has been generated.";

    const user = await User.findOne({ email: rawEmail });
    if (!user) {
      return res.json({ ok: true, message: genericMessage });
    }

    const { token, tokenHash } = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

    user.passwordResetTokenHash = tokenHash;
    user.passwordResetExpiresAt = expiresAt;
    user.passwordResetRequestedAt = new Date();
    await user.save();

    const resetUrl = buildClientResetUrl(token, rawEmail);
    const delivery = await sendPasswordResetEmail({
      to: rawEmail,
      name: user.name,
      resetUrl,
      expiresAt,
    });
    const exposeResetUrl =
      parseBooleanEnv(process.env.EXPOSE_RESET_LINK_IN_RESPONSE, false) ||
      !delivery.emailed;

    return res.json({
      ok: true,
      message: genericMessage,
      reset: {
        expiresAt,
        ...(exposeResetUrl ? { resetUrl } : {}),
      },
      delivery: {
        emailed: Boolean(delivery.emailed),
        channel: delivery.emailed ? "email" : "api",
        reason: delivery.reason || null,
      },
    });
  } catch (err) {
    console.error("forgotPassword error:", err);
    return res
      .status(500)
      .json({ error: "Unable to process forgot password request" });
  }
}

// POST /api/auth/reset-password
export async function resetPassword(req, res) {
  try {
    const rawToken = String(req.body?.token || "").trim();
    const rawEmail = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const newPassword = String(
      req.body?.newPassword || req.body?.password || "",
    );

    if (!rawToken) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const query = {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    };

    if (rawEmail) {
      query.email = rawEmail;
    }

    const user = await User.findOne(query);
    if (!user) {
      return res.status(400).json({
        error: "Invalid or expired reset token",
      });
    }

    user.password = newPassword;
    user.mustResetPassword = false;
    user.passwordResetForcedAt = null;
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    return res.json({
      ok: true,
      message: "Password has been reset successfully",
      user: {
        id: String(user._id),
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });
  } catch (err) {
    console.error("resetPassword error:", err);
    return res.status(500).json({ error: "Unable to reset password" });
  }
}
