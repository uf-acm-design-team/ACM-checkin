"use client";
// import the helper typescript function for getting the link of the specific org
import { buildCheckinLink } from "@/lib/checkin-link";

interface QRCodeTabProps {
  organizationName: string;
  qrCode: string | null;
}

export default function QRCodeTab({
  organizationName,
  qrCode,
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

    {qrCode ? (
      <div className="flex justify-center rounded-card border border-line bg-white p-6">
        <img
          src={qrCode}
          alt={`${organizationName} check-in QR code`}
          className="h-56 w-56 object-contain"
        />
      </div>
    ) : (
      <div className="rounded-card border border-line bg-surface-sunken p-6 text-center text-sm text-ink-muted">
        No QR code has been generated yet.
      </div>
    )}
  </div>
);
}
