import "server-only";
import { randomUUID } from "crypto";
import sharp from "sharp";
import {
  getPhotoBucketName,
  getPrivateStorageClient,
  PhotoStorageConfigurationError,
  assertPrivatePhotoBucket,
} from "@/lib/supabase-storage";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const ALLOWED_DECODED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class PhotoUploadError extends Error {}

function isSafeObjectPath(customerProfileId: string, objectPath: string): boolean {
  return (
    objectPath.startsWith(`${customerProfileId}/`) &&
    !objectPath.includes("..") &&
    /^[A-Za-z0-9_-]+\/[0-9a-f-]+\.webp$/i.test(objectPath)
  );
}

async function normalizePassportPhoto(file: File): Promise<Buffer> {
  if (!(file instanceof File) || file.size === 0) {
    throw new PhotoUploadError("Please choose a photo to upload.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new PhotoUploadError("Photo must be smaller than 5MB.");
  }

  const input = Buffer.from(await file.arrayBuffer());

  try {
    const image = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS });
    const metadata = await image.metadata();
    if (!metadata.format || !ALLOWED_DECODED_FORMATS.has(metadata.format)) {
      throw new PhotoUploadError("Photo must be a genuine JPEG, PNG, or WEBP image.");
    }

    // rotate() honors EXIF orientation. Re-encoding without withMetadata()
    // removes EXIF/GPS and other embedded metadata from the stored image.
    return await image
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (error) {
    if (error instanceof PhotoUploadError) throw error;
    throw new PhotoUploadError("The selected file is not a valid, readable image.");
  }
}

/** Save an inspected, normalized image in the private Supabase bucket. */
export async function savePassportPhoto(
  customerProfileId: string,
  file: File,
): Promise<string> {
  const normalized = await normalizePassportPhoto(file);
  const objectPath = `${customerProfileId}/${randomUUID()}.webp`;

  try {
    await assertPrivatePhotoBucket();
    const client = getPrivateStorageClient();
    const { error } = await client.storage.from(getPhotoBucketName()).upload(objectPath, normalized, {
      contentType: "image/webp",
      cacheControl: "0",
      upsert: false,
    });
    if (error) throw error;
    return objectPath;
  } catch (error) {
    if (error instanceof PhotoStorageConfigurationError) {
      console.error(error.message);
    } else {
      console.error("Private passport photo upload failed.", error);
    }
    throw new PhotoUploadError("Photo storage is temporarily unavailable. Please try again later.");
  }
}

/** Delete only an object belonging to the expected customer namespace. */
export async function deletePassportPhoto(
  customerProfileId: string,
  objectPath: string | null | undefined,
): Promise<void> {
  if (!objectPath || !isSafeObjectPath(customerProfileId, objectPath)) return;

  await assertPrivatePhotoBucket();
  const client = getPrivateStorageClient();
  const { error } = await client.storage.from(getPhotoBucketName()).remove([objectPath]);
  if (error) throw error;
}
