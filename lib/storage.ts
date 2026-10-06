import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const ALLOWED_EXTENSIONS = new Set([
  // Documents
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "txt",
  "rtf",
  // Images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  // Archives
  "zip",
  "tar",
  "gz",
  "rar",
  "7z",
  // Code & text files
  "c",
  "cpp",
  "h",
  "java",
  "py",
  "js",
  "ts",
  "html",
  "css",
  "sql",
  "sh",
  "json",
  "md",
]);

export const DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "vbs",
  "msi",
  "scr",
  "pif",
  "com",
  "jar",
  "apk",
  "bin",
  "app",
  "dll",
  "so",
  "dylib",
]);

// Common MIME mapping for allowed extensions
const EXTENSION_MIME_MAP: Record<string, string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  txt: ["text/plain"],
  rtf: ["application/rtf", "text/rtf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  svg: ["image/svg+xml"],
  zip: [
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
  ],
  tar: ["application/x-tar"],
  gz: ["application/gzip", "application/x-gzip"],
  rar: ["application/vnd.rar", "application/x-rar-compressed"],
  "7z": ["application/x-7z-compressed"],
  c: ["text/x-c", "text/plain"],
  cpp: ["text/x-c++src", "text/plain"],
  h: ["text/x-chdr", "text/plain"],
  java: ["text/x-java-source", "text/plain"],
  py: ["text/x-python", "text/plain"],
  js: ["text/javascript", "application/javascript", "text/plain"],
  ts: ["text/typescript", "application/typescript", "text/plain"],
  html: ["text/html", "text/plain"],
  css: ["text/css", "text/plain"],
  sql: ["application/sql", "text/plain"],
  sh: ["application/x-sh", "text/plain"],
  json: ["application/json", "text/plain"],
  md: ["text/markdown", "text/plain"],
};

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  ext?: string;
  mime?: string;
  sanitizedName?: string;
}

/**
 * Sanitizes the display filename by removing directory traversal patterns,
 * control characters, and leading/trailing dots/spaces.
 */
export function sanitizeDisplayName(originalName: string): string {
  if (!originalName) return "file";

  // Extract base filename only (strip all directory components)
  let name = originalName.replace(/\\/g, "/");
  const lastSlash = name.lastIndexOf("/");
  if (lastSlash !== -1) {
    name = name.slice(lastSlash + 1);
  }

  // Remove control characters (ASCII 0-31 and 127)
  name = name.replace(/[\x00-\x1F\x7F]/g, "");

  // Trim whitespace and leading periods
  name = name.trim().replace(/^\.+/, "");

  if (!name) return "file";
  return name.slice(0, 150);
}

/**
 * Validates file extension, double extensions, magic bytes, and size limits.
 */
export async function validateMaterialFile(
  filename: string,
  buffer: Buffer | Uint8Array,
  declaredMime?: string,
  maxSizeMb?: number
): Promise<FileValidationResult> {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // 1. Filename parts & double extension checks
  const cleanName = sanitizeDisplayName(filename);
  const parts = cleanName.toLowerCase().split(".");

  if (parts.length < 2) {
    return {
      valid: false,
      error: "File must have a valid extension.",
    };
  }

  const ext = parts[parts.length - 1];

  // Check for dangerous executable extensions anywhere in the filename (e.g., .exe, .bat)
  for (const part of parts) {
    if (DANGEROUS_EXTENSIONS.has(part)) {
      return {
        valid: false,
        error: `Executable and dangerous file extensions (.${part}) are strictly prohibited.`,
      };
    }
  }

  // Check if final extension is allowed
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File extension .${ext} is not allowed. Allowed types: PDF, Office docs, images, archives, code files.`,
    };
  }

  // 2. Magic byte / Signature Validation
  // Check for executable signatures (DOS/PE MZ header: 0x4D 0x5A)
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) {
    return {
      valid: false,
      error: "Executable binary signatures (MZ header) detected. Renamed .exe files are rejected.",
    };
  }

  // Check for Linux ELF executable signature: 0x7F 'E' 'L' 'F'
  if (
    buf.length >= 4 &&
    buf[0] === 0x7f &&
    buf[1] === 0x45 &&
    buf[2] === 0x4c &&
    buf[3] === 0x46
  ) {
    return {
      valid: false,
      error: "Linux ELF executable binary signatures detected. Binary files are rejected.",
    };
  }

  // Specific format magic bytes validation
  if (ext === "pdf") {
    // PDF must start with %PDF- (0x25 0x50 0x44 0x46)
    const isPdf =
      buf.length >= 4 &&
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46;
    if (!isPdf) {
      return {
        valid: false,
        error: "Invalid PDF format: file header does not match PDF signature.",
      };
    }
  } else if (ext === "png") {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const isPng =
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47;
    if (!isPng) {
      return {
        valid: false,
        error: "Invalid PNG format: file header does not match PNG signature.",
      };
    }
  } else if (ext === "jpg" || ext === "jpeg") {
    // JPEG signature: FF D8 FF
    const isJpg =
      buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    if (!isJpg) {
      return {
        valid: false,
        error: "Invalid JPEG format: file header does not match JPEG signature.",
      };
    }
  } else if (ext === "gif") {
    // GIF signature: GIF87a or GIF89a
    const isGif =
      buf.length >= 6 &&
      buf[0] === 0x47 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x38;
    if (!isGif) {
      return {
        valid: false,
        error: "Invalid GIF format: file header does not match GIF signature.",
      };
    }
  } else if (ext === "docx" || ext === "pptx" || ext === "zip") {
    // PK zip signature: 50 4B 03 04 (or 05 06 / 07 08)
    const isPk =
      buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
    if (!isPk) {
      return {
        valid: false,
        error: `Invalid ${ext.toUpperCase()} format: file header does not match ZIP container signature.`,
      };
    }
  } else if (ext === "doc" || ext === "ppt") {
    // OLE Compound Document header: D0 CF 11 E0 A1 B1 1A E1
    const isOle =
      buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
    if (!isOle) {
      return {
        valid: false,
        error: `Invalid ${ext.toUpperCase()} format: file header does not match legacy MS Office binary format.`,
      };
    }
  }

  // 3. MIME type resolution & spoofing check
  const allowedMimes = EXTENSION_MIME_MAP[ext] || ["application/octet-stream"];
  const finalMime = declaredMime || allowedMimes[0];

  // If client declared an obviously contradictory MIME (e.g. application/x-msdownload for .pdf)
  if (
    declaredMime &&
    (declaredMime.includes("executable") ||
      declaredMime.includes("x-msdownload") ||
      declaredMime.includes("x-dosexec"))
  ) {
    return {
      valid: false,
      error: `Prohibited MIME type (${declaredMime}) rejected.`,
    };
  }

  // 4. File Size Limit
  let limitMb = maxSizeMb;
  if (!limitMb) {
    try {
      const setting = await prisma.setting.findUnique({
        where: { key: "upload_limits" },
      });
      const settingValue = setting?.value as { maxMaterialSizeMb?: number };
      limitMb = settingValue?.maxMaterialSizeMb || 50;
    } catch {
      limitMb = 50;
    }
  }

  const maxBytes = limitMb * 1024 * 1024;
  if (buf.length > maxBytes) {
    return {
      valid: false,
      error: `File size (${(buf.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${limitMb} MB.`,
    };
  }

  return {
    valid: true,
    ext,
    mime: finalMime,
    sanitizedName: cleanName,
  };
}

/**
 * Uploads a validated buffer to the private Supabase Storage bucket.
 * Never exposes the service key to the client.
 */
export async function uploadToSupabaseBucket(
  fileKey: string,
  buffer: Buffer | Uint8Array,
  mime: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_BUCKET}/${fileKey}`;
    const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": mime,
        "x-upsert": "true",
      },
      body: new Uint8Array(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        error: `Supabase Storage upload failed (${res.status}): ${errorText}`,
      };
    }

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to upload file to storage.",
    };
  }
}

/**
 * Generates a short-lived (default 60-second) signed URL to download a file from the private bucket.
 */
export async function getSignedDownloadUrl(
  fileKey: string,
  expiresInSeconds: number = 60
): Promise<string> {
  const signUrl = `${env.SUPABASE_URL}/storage/v1/object/sign/${env.SUPABASE_BUCKET}/${fileKey}`;

  const res = await fetch(signUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to create signed URL (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { signedURL: string };
  return `${env.SUPABASE_URL}/storage/v1${data.signedURL}`;
}

/**
 * Deletes a file from the private Supabase Storage bucket.
 */
export async function deleteFromSupabaseBucket(fileKey: string): Promise<void> {
  try {
    const url = `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_BUCKET}/${fileKey}`;

    await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
  } catch (err) {
    console.error(`Failed to delete object from bucket: ${fileKey}`, err);
  }
}
