"use client";

/**
 * Passport photo upload/replace form (client component) — Admin or the
 * customer's own Agent.
 * ----------------------------------------------------------------------------
 * Unlike every other form in this app, this one posts raw `FormData` to a
 * Server Action instead of a typed JSON object — Server Actions CAN accept
 * `FormData` (including `File` values) directly, which is the only way to
 * get a browser-selected file to the server here. See
 * uploadCustomerPhotoAction for why.
 *
 * Shows a live local preview of the newly-selected file (via
 * URL.createObjectURL) before upload, and falls back to the existing saved
 * photo (or a placeholder) otherwise.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadCustomerPhotoAction } from "@/server/actions/customer.actions";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import { CustomerPhoto } from "@/components/customer/CustomerPhoto";

interface PassportPhotoUploadProps {
  customerProfileId: string;
  hasCurrentPhoto: boolean;
}

export function PassportPhotoUpload({
  customerProfileId,
  hasCurrentPhoto,
}: PassportPhotoUploadProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFormError(null);
    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setFormError("Choose a photo first.");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.set("customerProfileId", customerProfileId);
    formData.set("photo", selectedFile);

    const result = await uploadCustomerPhotoAction(formData);
    setIsSubmitting(false);

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({ type: "success", message: "Passport photo uploaded." });
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {previewUrl ? (
          // The object URL exists only in this browser and is revoked when it
          // is replaced or the form unmounts.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Selected passport photo preview"
            className="h-24 w-24 rounded-xl border border-line object-cover"
          />
        ) : (
          <CustomerPhoto
            customerProfileId={customerProfileId}
            hasPhoto={hasCurrentPhoto}
            alt="Customer passport photo"
          />
        )}

        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            aria-label="Choose passport photo"
            className="max-w-full text-sm text-ink"
          />
          <p className="text-xs text-ink-muted">JPEG, PNG, or WEBP. Max 5MB.</p>
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}

      <Button
        type="button"
        variant="secondary"
        isLoading={isSubmitting}
        onClick={handleUpload}
        disabled={!selectedFile}
        className="w-fit"
      >
        {hasCurrentPhoto ? "Replace Photo" : "Upload Photo"}
      </Button>
    </div>
  );
}
