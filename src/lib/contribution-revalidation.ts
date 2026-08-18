/** Routes whose server-rendered financial data changes after Quick Pay. */
export function quickPayRevalidationPaths(customerProfileId: string): string[] {
  return [
    "/admin",
    "/agent",
    "/agent/collections",
    `/admin/customers/${customerProfileId}`,
    `/agent/customers/${customerProfileId}`,
    "/admin/payouts",
    "/customer",
    "/admin/tracking",
    "/agent/tracking",
  ];
}
