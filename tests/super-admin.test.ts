import assert from "node:assert/strict";
import test from "node:test";
import {
  validateAdminArchive,
  validateAdminStatusChange,
} from "../src/lib/admin-account-policy";
import {
  decodeAuditCursor,
  encodeAuditCursor,
} from "../src/lib/audit-pagination";
import { isSessionSecurityStateCurrent } from "../src/lib/session-revocation";

test("Admin activation refuses a second active Admin", () => {
  const error = validateAdminStatusChange({
    account: { exists: true, isActive: false, isArchived: false },
    makeActive: true,
    anotherActiveAdminExists: true,
  });
  assert.equal(error, "Another Admin is active. Deactivate that account first.");
});

test("archived Admins cannot be reactivated", () => {
  const error = validateAdminStatusChange({
    account: { exists: true, isActive: false, isArchived: true },
    makeActive: true,
    anotherActiveAdminExists: false,
  });
  assert.equal(error, "Archived Admin accounts cannot be reactivated.");
});

test("an active Admin must be deactivated before archival", () => {
  assert.equal(
    validateAdminArchive({ exists: true, isActive: true, isArchived: false }),
    "Deactivate this Admin before archiving the account.",
  );
  assert.equal(
    validateAdminArchive({ exists: true, isActive: false, isArchived: false }),
    null,
  );
});

test("archiving an account invalidates its existing session", () => {
  const claims = { userId: "admin-1", role: "ADMIN" as const, sessionVersion: 2 };
  assert.equal(
    isSessionSecurityStateCurrent(claims, {
      isActive: false,
      role: "ADMIN",
      sessionVersion: 3,
      archivedAt: new Date(),
    }),
    false,
  );
});

test("activity cursors round-trip stable date and id ordering fields", () => {
  const cursor = {
    createdAt: new Date("2026-09-26T09:15:00.000Z"),
    id: "audit-123",
  };
  assert.deepEqual(decodeAuditCursor(encodeAuditCursor(cursor)), cursor);
});

test("invalid activity cursors are ignored safely", () => {
  assert.equal(decodeAuditCursor("not-a-valid-cursor"), null);
  assert.equal(decodeAuditCursor("x".repeat(501)), null);
  assert.equal(decodeAuditCursor(undefined), null);
});
