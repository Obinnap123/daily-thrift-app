/**
 * Passport photo upload storage.
 * ----------------------------------------------------------------------------
 * This app runs on a Node.js server (NOT Cloudflare Workers/Pages — see
 * README "Deployment Notes"), so local filesystem access via `fs` is
 * available here, unlike in the Workers runtime. Uploaded photos are saved
 * under `public/uploads/customers/` so Next.js serves them directly as
 * static files at `/uploads/customers/<filename>`.
 *
 * ⚠️ Production note: on most Node hosts (Railway, Render, Fly.io, a bare
 * VPS) local disk is fine as long as it's a persistent volume, but on
 * ephemeral/serverless Node runtimes local files can be wiped on redeploy.
 * If that turns out to be the target host, swap this module's
 * implementation for an S3-compatible client (e.g. Cloudflare R2, AWS S3)
 * without touching any calling code — every caller only depends on the
 * `savePassportPhoto()` / `deletePassportPhoto()` function signatures below.
 */
import "server-only";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_SUBDIR = "uploads/customers";
const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, UPLOAD_SUBDIR);

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export class PhotoUploadError extends Error {}

/**
 * Save an uploaded passport photo (from a multipart form `File`) to disk
 * and return its public URL path (e.g. "/uploads/customers/abc123.jpg").
 * Throws `PhotoUploadError` with a user-friendly message on invalid input
 * — callers should catch this and surface it via the normal
 * `ActionResult.fail()` pattern rather than letting it bubble as a 500.
 */
export async function savePassportPhoto(file: File): Promise<string> {
  if (!(file instanceof File) || file.size === 0) {
    throw new PhotoUploadError("Please choose a photo to upload.");
  }

  const extension = ALLOWED_MIME_TYPES[file.type];
  if (!extension) {
    throw new PhotoUploadError("Photo must be a JPEG, PNG, or WEBP image.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new PhotoUploadError("Photo must be smaller than 5MB.");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const filename = `${randomUUID()}.${extension}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return `/${UPLOAD_SUBDIR}/${filename}`;
}

/**
 * Delete a previously-saved passport photo, given its public URL path
 * (as returned by savePassportPhoto). Used when a customer uploads a
 * replacement photo, to avoid leaving orphaned files on disk. Silently
 * ignores a missing file (e.g. already deleted, or was never a local
 * path) rather than failing the whole edit operation over a cleanup step.
 */
export async function deletePassportPhoto(publicUrlPath: string | null | undefined): Promise<void> {
  if (!publicUrlPath || !publicUrlPath.startsWith(`/${UPLOAD_SUBDIR}/`)) {
    return;
  }
  const filename = publicUrlPath.slice(`/${UPLOAD_SUBDIR}/`.length);
  // Defense against path traversal in a stored value we don't fully trust.
  if (filename.includes("..") || filename.includes("/")) {
    return;
  }
  try {
    await unlink(path.join(UPLOAD_DIR, filename));
  } catch {
    // File already gone or never existed locally — not a failure case.
  }
}
