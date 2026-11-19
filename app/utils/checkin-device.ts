import { cookies } from "next/headers";

import { CHECKIN_DEVICE_COOKIE, verifyDeviceCookie } from "@/lib/checkin-device";

/** Never accept a device id from action arguments or proxy headers. */
export async function checkInDeviceId(): Promise<string | null> {
  const jar = await cookies();
  return verifyDeviceCookie(
    jar.get(CHECKIN_DEVICE_COOKIE)?.value,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );
}
