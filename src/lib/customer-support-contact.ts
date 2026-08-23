interface CustomerSupportSettings {
  supportPhone?: string | null;
  supportWhatsApp?: string | null;
}

export interface CustomerSupportContacts {
  callNumber: string | null;
  whatsappNumber: string | null;
}

/**
 * Resolve the public customer-support contacts from Admin settings.
 * A blank WhatsApp number deliberately reuses the call number so businesses
 * with one shared number do not need to enter it twice.
 */
export function resolveCustomerSupportContacts(
  settings: CustomerSupportSettings,
): CustomerSupportContacts {
  const callNumber = optionalValue(settings.supportPhone);
  const whatsappSource = optionalValue(settings.supportWhatsApp) ?? callNumber;

  return {
    callNumber,
    whatsappNumber: whatsappSource ? toWhatsAppNumber(whatsappSource) : null,
  };
}

function optionalValue(value?: string | null): string | null {
  return value?.trim() || null;
}

function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
}
