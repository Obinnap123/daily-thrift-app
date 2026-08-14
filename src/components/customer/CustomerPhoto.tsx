import { clsx } from "clsx";

interface CustomerPhotoProps {
  customerProfileId: string;
  hasPhoto: boolean;
  alt: string;
  className?: string;
}

export function CustomerPhoto({
  customerProfileId,
  hasPhoto,
  alt,
  className,
}: CustomerPhotoProps) {
  if (!hasPhoto) {
    return (
      <div
        className={clsx(
          "flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-line bg-surface-muted text-center text-xs text-ink-subtle",
          className,
        )}
        aria-label="No passport photo"
      >
        No photo
      </div>
    );
  }

  return (
    // A normal image request preserves the signed-in browser session. The
    // protected API response is intentionally not eligible for Next's public
    // image optimizer cache.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/customers/${encodeURIComponent(customerProfileId)}/photo`}
      alt={alt}
      className={clsx(
        "h-24 w-24 rounded-xl border border-line bg-surface-muted object-cover",
        className,
      )}
      loading="lazy"
      decoding="async"
    />
  );
}
