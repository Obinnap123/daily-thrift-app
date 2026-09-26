interface AdminAccountState {
  exists: boolean;
  isActive: boolean;
  isArchived: boolean;
}

export function validateAdminStatusChange(input: {
  account: AdminAccountState;
  makeActive: boolean;
  anotherActiveAdminExists: boolean;
}): string | null {
  if (!input.account.exists) return "Admin account not found.";
  if (input.account.isArchived) return "Archived Admin accounts cannot be reactivated.";
  if (input.makeActive && input.anotherActiveAdminExists) {
    return "Another Admin is active. Deactivate that account first.";
  }
  return null;
}

export function validateAdminArchive(account: AdminAccountState): string | null {
  if (!account.exists || account.isArchived) {
    return "Admin account not found or already archived.";
  }
  if (account.isActive) return "Deactivate this Admin before archiving the account.";
  return null;
}
