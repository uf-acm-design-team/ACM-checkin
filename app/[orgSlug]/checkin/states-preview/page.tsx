"use client";

/**
 * Visual harness for the check-in states (dev only).
 *
 * Every state rendered at once against fixture data, so the empty/error/loading
 * screens -- the ones that need a real meeting, a denied permission or a dead
 * network to reach -- can be inspected side by side. Sits under the public
 * /[orgSlug]/checkin path so it inherits the org's tokens and needs no auth.
 * Returns 404 outside development.
 */

import { notFound } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { resolveBranding, brandingToCssVars } from "@/lib/branding";
import {
  AlreadyCheckedInState,
  LoadingState,
  LocationAskState,
  LocationDeniedState,
  NetworkErrorState,
  LocationCheckingState,
  NoActiveMeetingState,
  OrgNotFoundState,
  SuccessState,
  TooFarState,
} from "@/components/checkin/states";

const noop = () => {};

const boards: [string, React.ReactNode][] = [
  ["1 · Loading", <LoadingState key="a" />],
  [
    "2 · No active meeting",
    <NoActiveMeetingState
      key="b"
      opensIn="in 24 minutes"
      next={{
        title: "General Body Meeting #5",
        when: "Tue Oct 21 · 7:00 PM EST",
        where: "CSE E121, Malachowsky Hall",
      }}
      onAbout={noop}
    />,
  ],
  ["6 · Location ask", <LocationAskState key="c" radius={200} where="CSE E121" onShare={noop} onAskOfficer={noop} />],
  ["8 · Too far", <TooFarState key="d" metresAway={340} radius={200} where="CSE E121" onRetry={noop} onAskOfficer={noop} />],
  ["7 · Location checking", <LocationCheckingState key="e2" />],
  ["9 · Location denied", <LocationDeniedState key="e" onRetry={noop} onAskOfficer={noop} />],
  ["11 · Already checked in", <AlreadyCheckedInState key="f" meetingTitle="General Body Meeting #5" at="6:58 PM EST" onStats={noop} />],
  ["12 · Network error", <NetworkErrorState key="g" detail="POST /checkin · timeout after 10s" reference="8f2a·19:04:22 EST" onRetry={noop} />],
  [
    "Success · threshold met",
    <SuccessState key="h" firstName="Maya" meetingTitle="General Body Meeting #4" where="CSE E121" at="7:04 PM EST" membership={{ attended: 3, threshold: 3 }} orgName="ACM at UF" onStats={noop} />,
  ],
  [
    "Success · progress",
    <SuccessState key="i" firstName="Maya" meetingTitle="Fall Kickoff Social" where="Reitz Union 2360" at="6:12 PM EST" membership={{ attended: 2, threshold: 3 }} orgName="ColorStack UF" onStats={noop} />,
  ],
  ["Org not found", <OrgNotFoundState key="j" slug="acm-uf" />],
];

/** ?palette=purple renders the whole set against a contrasting second org. */
const PALETTES: Record<string, unknown> = {
  purple: {
    colors: {
      primary: "#6D28D9",
      background: "#FFFFFF",
      backgroundSecondary: "#F5F3FF",
      accent: "#4C1D95",
      text: "#18181B",
    },
    particleColor: "#DDD6FE",
  },
};

export default function StatesPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const palette = useSearchParams().get("palette");
  const override = palette ? PALETTES[palette] : null;
  return (
    <div className="flex flex-wrap items-start gap-6 bg-canvas p-6">
      {override != null && (
        <style>{`:root{${brandingToCssVars(resolveBranding(override))}}`}</style>
      )}
      {boards.map(([label, node]) => (
        <div key={label} className="flex flex-col gap-2">
          <span className="font-mono text-[10.5px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
            {label}
          </span>
          <div className="flex h-[760px] w-[390px] flex-col overflow-hidden rounded-phone border border-line bg-surface">
            {node}
          </div>
        </div>
      ))}
    </div>
  );
}
