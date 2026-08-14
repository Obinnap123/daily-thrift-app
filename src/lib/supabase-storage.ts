import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PHOTO_BUCKET = "customer-passport-photos";

let storageClient: SupabaseClient | null = null;
let privateBucketCheck: Promise<void> | null = null;

export class PhotoStorageConfigurationError extends Error {}

function requireServerEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new PhotoStorageConfigurationError(
      `Private photo storage is not configured (${name} is missing).`,
    );
  }
  return value;
}

export function getPhotoBucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_PHOTO_BUCKET;
}

/**
 * Service-role access is intentionally isolated to server-only modules. Never
 * expose this client or its key through NEXT_PUBLIC_* variables.
 */
export function getPrivateStorageClient(): SupabaseClient {
  if (storageClient) return storageClient;

  const supabaseUrl = requireServerEnvironment("SUPABASE_URL");
  const serviceRoleKey = requireServerEnvironment("SUPABASE_SERVICE_ROLE_KEY");

  storageClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return storageClient;
}

export async function assertPrivatePhotoBucket(): Promise<void> {
  if (!privateBucketCheck) {
    privateBucketCheck = (async () => {
      const client = getPrivateStorageClient();
      const { data, error } = await client.storage.getBucket(getPhotoBucketName());
      if (error || !data) {
        throw new PhotoStorageConfigurationError(
          "The private customer photo bucket is missing or unavailable.",
        );
      }
      if (data.public) {
        throw new PhotoStorageConfigurationError(
          "The customer photo bucket must be private before photos can be used.",
        );
      }
    })().catch((error) => {
      // Permit a later retry after a transient network/configuration failure.
      privateBucketCheck = null;
      throw error;
    });
  }

  return privateBucketCheck;
}

export async function downloadPrivateCustomerPhoto(objectPath: string): Promise<Blob> {
  await assertPrivatePhotoBucket();
  const client = getPrivateStorageClient();
  const { data, error } = await client.storage.from(getPhotoBucketName()).download(objectPath);

  if (error || !data) {
    throw new Error("Private customer photo could not be downloaded.");
  }

  return data;
}
