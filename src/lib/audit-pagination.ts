export interface AuditCursor {
  createdAt: Date;
  id: string;
}

interface SerializedAuditCursor {
  createdAt: string;
  id: string;
}

export function encodeAuditCursor(cursor: AuditCursor): string {
  const value: SerializedAuditCursor = {
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
  };
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeAuditCursor(value: string | undefined): AuditCursor | null {
  if (!value || value.length > 500) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<SerializedAuditCursor>;
    const createdAt = typeof parsed.createdAt === "string" ? new Date(parsed.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime()) || typeof parsed.id !== "string" || !parsed.id) {
      return null;
    }
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}
