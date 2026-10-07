"use client";
// import the helper typescript function for getting the link of the specific org
import { buildCheckinLink } from "@/lib/checkin-link";

import CheckinQrCard from "./checkin-qr-card";

interface QRCodeTabProps {
  organizationName: string;
  orgSlug: string;
}

export default function QRCodeTab({
  organizationName,
  orgSlug,
}: QRCodeTabProps) {

  // use the helper function here to create the org link when the user clicks on the qrcode tab.
  const orgName: string = organizationName;
  const lowerOrgName = orgName.toLowerCase();
  const orgLink = buildCheckinLink(lowerOrgName,"localhost:3000");

return (
  <div className="max-w-xl rounded-card border border-line bg-surface p-5 sm:p-7">
    <div className="mb-1 text-lg font-bold tracking-[-0.02em]">
      Check-In QR Code
    </div>

    <p className="mb-5 text-[13px] leading-relaxed text-ink-muted">
      Scan this QR code to open the check-in page for {organizationName}.
    </p>

    <CheckinQrCard orgName={organizationName} orgSlug={orgSlug} />
  </div>
);
}
