"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { buildCheckinLink } from "@/lib/checkin-link";
import { QR_OPTIONS } from "@/lib/qr";
import {
  Button,
  FIELD_CLASS,
  Field,
  Notice,
  Skeleton,
} from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// The org's check-in QR, generated in the browser from its slug rather than
// stored. A QR is deterministic and a few KB, so there is nothing worth
// persisting -- and a stored image would go stale the moment the link format
// changes. The link itself comes from buildCheckinLink (lib/checkin-link.ts),
// the one place that format is defined.
//
// Renders only the card's contents: the QR Code tab around it already draws
// the bordered surface and heading.

// Large enough to print on a poster without blurring. The SVG download is
// vector, so it scales to any size on its own.
const PNG_WIDTH = 1024;

interface CheckinQrCardProps {
  orgName: string;
  orgSlug: string;
}

// Same temporary-<a download> pattern as downloadCsv in lib/attendance-csv.ts.
function saveFile(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function CheckinQrCard({ orgName, orgSlug }: CheckinQrCardProps) {
  // This card only mounts after the dashboard has loaded in the browser, so
  // window is always there in practice. The guard keeps a stray server render
  // from crashing instead of just producing a relative link.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = buildCheckinLink(orgSlug, origin);

  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Regenerate only when the link changes. Copying, or any other state change
  // in this card, re-renders it with the same link, and React skips an effect
  // whose dependencies are unchanged -- so the QR is not redrawn for those.
  //
  // useEffect rather than useMemo because toString is async. The `cancelled`
  // flag stops a slow, superseded result from overwriting a newer one if the
  // link changes again before it resolves.
  useEffect(() => {
    let cancelled = false;

    QRCode.toString(link, { ...QR_OPTIONS, type: "svg" })
      .then((markup) => {
        if (cancelled) return;
        setSvg(markup);
        setError(null);
      })
      .catch((err) => {
        console.error("QR generation failed:", err);
        if (!cancelled) setError("Couldn't generate the QR code.");
      });

    return () => {
      cancelled = true;
    };
  }, [link]);

  // "Copied" reverts after a moment so the button can be used again.
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const handleCopy = async () => {
    setActionError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch (err) {
      // The clipboard API needs a secure context (https or localhost), so it
      // can fail on a plain-http LAN address. Select the text instead so the
      // officer can still copy it by hand.
      console.error("Copy failed:", err);
      linkInputRef.current?.select();
      setActionError("Couldn't copy automatically — the link is selected, press Ctrl+C / Cmd+C.");
    }
  };

  // Rendered on click rather than up front: most visits never download.
  const handleDownloadPng = async () => {
    setActionError(null);
    try {
      const dataUrl = await QRCode.toDataURL(link, {
        ...QR_OPTIONS,
        width: PNG_WIDTH,
      });
      saveFile(dataUrl, `${orgSlug}-checkin-qr.png`);
    } catch (err) {
      console.error("PNG export failed:", err);
      setActionError("Couldn't create the PNG. Try again.");
    }
  };

  // Reuses the SVG already drawn for the preview -- no second render.
  const handleDownloadSvg = () => {
    if (!svg) return;
    setActionError(null);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    saveFile(url, `${orgSlug}-checkin-qr.svg`);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center rounded-card border border-line bg-surface p-6">
        {error ? (
          <Notice tone="bad" title={error} className="w-full">
            Reload the page to try again.
          </Notice>
        ) : svg ? (
          // Shown as an <img> from a data URL rather than injected as raw
          // markup, so nothing is ever parsed into the page's DOM. next/image
          // adds nothing for an inline data URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
            alt={`${orgName} check-in QR code`}
            className="size-56"
          />
        ) : (
          <Skeleton className="size-56" />
        )}
      </div>

      <Field
        label="Check-in link"
        htmlFor="checkin-link"
        hint="The same link the QR code opens. Share it anywhere a QR can't go."
      >
        <div className="flex gap-2">
          <input
            id="checkin-link"
            ref={linkInputRef}
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(FIELD_CLASS, "min-w-0 font-mono text-[13px]")}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleCopy}
            className="flex-none"
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Field>

      {/* PNG is the primary action: it's what goes on a slide or a poster.
          SVG is for anyone who needs to resize it without losing sharpness. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          disabled={!svg}
          onClick={handleDownloadSvg}
        >
          Download SVG
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!svg}
          onClick={handleDownloadPng}
        >
          Download PNG
        </Button>
      </div>

      {actionError && <p className="m-0 text-xs text-bad">{actionError}</p>}
    </div>
  );
}
