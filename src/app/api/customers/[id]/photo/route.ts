import { canViewCustomerPhoto } from "@/lib/customer-photo-access";
import { downloadPrivateCustomerPhoto } from "@/lib/supabase-storage";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Disposition": "inline",
  "Content-Type": "image/webp",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const customer = await prisma.customerProfile.findUnique({
    where: { id },
    select: {
      userId: true,
      assignedAgentId: true,
      passportPhotoUrl: true,
    },
  });

  // Return the same response for a missing photo and a forbidden photo so a
  // caller cannot use this endpoint to enumerate other customers' records.
  if (
    !customer?.passportPhotoUrl ||
    !canViewCustomerPhoto(user, customer)
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const photo = await downloadPrivateCustomerPhoto(customer.passportPhotoUrl);
    return new Response(await photo.arrayBuffer(), {
      status: 200,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  } catch (error) {
    console.error("Authorized customer photo download failed.", error);
    return new Response("Not found", { status: 404 });
  }
}
