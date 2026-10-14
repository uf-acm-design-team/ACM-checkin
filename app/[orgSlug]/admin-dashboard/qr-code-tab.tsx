"use client";

import CheckinQrCard from "./checkin-qr-card";

interface QRCodeTabProps {
  organizationName: string;
  orgSlug: string;
}

export default function QRCodeTab({
  organizationName,
  orgSlug,
}: QRCodeTabProps) {


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
