import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import AdminAuditLog from "../models/AdminAuditLog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSET_DIR = path.resolve(
  __dirname,
  "../../client/public/certificate-assets",
);
const MANIFEST_PATH = path.join(ASSET_DIR, "manifest.json");

const DEFAULT_ASSETS = {
  logo: {
    key: "logo",
    url: "/certificate-assets/organization-logo.svg",
    fileName: "organization-logo.svg",
    mimeType: "image/svg+xml",
    updatedAt: null,
  },
  signature: {
    key: "signature",
    url: "/certificate-assets/signature-scan.svg",
    fileName: "signature-scan.svg",
    mimeType: "image/svg+xml",
    updatedAt: null,
  },
  seal: {
    key: "seal",
    url: "/certificate-assets/official-seal.svg",
    fileName: "official-seal.svg",
    mimeType: "image/svg+xml",
    updatedAt: null,
  },
};

const MIME_TO_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const MAX_ASSET_BYTES = 2 * 1024 * 1024;

function safeBaseName(input) {
  return String(input || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80);
}

async function ensureAssetDir() {
  await fs.mkdir(ASSET_DIR, { recursive: true });
}

async function readManifest() {
  await ensureAssetDir();
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      logo: { ...DEFAULT_ASSETS.logo, ...(parsed.logo || {}) },
      signature: { ...DEFAULT_ASSETS.signature, ...(parsed.signature || {}) },
      seal: { ...DEFAULT_ASSETS.seal, ...(parsed.seal || {}) },
    };
  } catch {
    return { ...DEFAULT_ASSETS };
  }
}

async function writeManifest(manifest) {
  await ensureAssetDir();
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\n\r]+)$/);
  if (!match) {
    return null;
  }

  const mimeType = String(match[1] || "").toLowerCase();
  const base64 = String(match[2] || "").replace(/\s+/g, "");
  return { mimeType, buffer: Buffer.from(base64, "base64") };
}

function resolvePublicUrl(fileName) {
  return `/certificate-assets/${encodeURIComponent(fileName)}`;
}

function serializeManifest(manifest) {
  return {
    logo: manifest.logo,
    signature: manifest.signature,
    seal: manifest.seal,
  };
}

async function tryAudit(req, action, metadata = {}) {
  try {
    const adminId = req.user?.id || req.user?.sub;
    if (!adminId) return;
    await AdminAuditLog.create({
      adminId,
      action,
      targetType: "CertificateAssets",
      targetId: "certificate-assets",
      metadata,
    });
  } catch (err) {
    console.error("certificateAssetController.audit error:", err);
  }
}

export async function getCertificateAssets(_req, res) {
  try {
    const manifest = await readManifest();
    return res.json({ assets: serializeManifest(manifest) });
  } catch (err) {
    console.error("getCertificateAssets error:", err);
    return res
      .status(500)
      .json({ error: "Unable to fetch certificate assets" });
  }
}

export async function uploadCertificateAsset(req, res) {
  try {
    const key = String(req.params?.key || "")
      .trim()
      .toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_ASSETS, key)) {
      return res
        .status(400)
        .json({ error: "Invalid asset key. Use logo, signature, or seal." });
    }

    const { dataUrl, fileName } = req.body || {};
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      return res
        .status(400)
        .json({ error: "dataUrl must be a valid base64 data URL." });
    }

    const ext = MIME_TO_EXT[parsed.mimeType];
    if (!ext) {
      return res
        .status(400)
        .json({ error: "Unsupported image type. Use png, jpg, webp, or svg." });
    }

    if (!parsed.buffer || !parsed.buffer.length) {
      return res.status(400).json({ error: "Uploaded asset is empty." });
    }

    if (parsed.buffer.length > MAX_ASSET_BYTES) {
      return res.status(413).json({
        error: `Asset too large. Max allowed size is 2MB (${MAX_ASSET_BYTES} bytes).`,
      });
    }

    const base = safeBaseName(fileName || `${key}-asset`) || `${key}-asset`;
    const finalFileName = `${base}-${Date.now()}.${ext}`;
    const finalPath = path.join(ASSET_DIR, finalFileName);

    await ensureAssetDir();
    await fs.writeFile(finalPath, parsed.buffer);

    const manifest = await readManifest();
    const previous = manifest[key];
    manifest[key] = {
      key,
      url: resolvePublicUrl(finalFileName),
      fileName: finalFileName,
      mimeType: parsed.mimeType,
      updatedAt: new Date().toISOString(),
    };

    await writeManifest(manifest);

    // Try to clean up previous generated file if it is not the default file.
    if (
      previous?.fileName &&
      previous.fileName !== DEFAULT_ASSETS[key].fileName
    ) {
      const oldPath = path.join(ASSET_DIR, previous.fileName);
      try {
        await fs.unlink(oldPath);
      } catch {
        // ignore cleanup failure
      }
    }

    await tryAudit(req, "certificate.assets.upload", {
      key,
      fileName: finalFileName,
      mimeType: parsed.mimeType,
    });

    return res.json({
      message: "Certificate asset updated",
      asset: manifest[key],
      assets: serializeManifest(manifest),
    });
  } catch (err) {
    console.error("uploadCertificateAsset error:", err);
    return res
      .status(500)
      .json({ error: "Unable to upload certificate asset" });
  }
}

export async function resetCertificateAssets(req, res) {
  try {
    await writeManifest({ ...DEFAULT_ASSETS });

    await tryAudit(req, "certificate.assets.reset", {
      keys: ["logo", "signature", "seal"],
    });

    return res.json({
      message: "Certificate assets reset to defaults",
      assets: { ...DEFAULT_ASSETS },
    });
  } catch (err) {
    console.error("resetCertificateAssets error:", err);
    return res
      .status(500)
      .json({ error: "Unable to reset certificate assets" });
  }
}
