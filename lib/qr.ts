// Shared render options for every check-in QR code.
//
// One object so the dashboard card, its PNG/SVG downloads, and any future
// server route all draw the same code from the same link.
//
// The colours are hardcoded black on white rather than design tokens on
// purpose: scanners need maximum contrast whatever accent a club picks, and a
// downloaded file can't follow CSS variables anyway.
//
// Error correction "M" survives ~15% damage (a smudged print, a glare spot) --
// the usual choice for a plain URL. A margin of 2 modules is the quiet zone
// scanners use to find the code's edges.

import type { QRCodeRenderersOptions } from "qrcode";

export const QR_OPTIONS: QRCodeRenderersOptions = {
  errorCorrectionLevel: "M",
  margin: 2,
  color: {
    dark: "#000000",
    light: "#ffffff",
  },
};
