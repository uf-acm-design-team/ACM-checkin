import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import ParticlesLayout from "./components/ParticlesLayout";
import DeveloperShortcut from "./components/DeveloperShortcut";
import { clerkAppearance } from "@/lib/clerk-appearance";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UF Check-In",
  description: "Check-in system powered by ACM",
};

// Declared explicitly rather than relying on the framework default. `themeColor`
// paints the mobile browser chrome to match the gradient's top edge. Zoom is
// deliberately left unrestricted -- capping it locks out users who need to
// magnify.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0021a5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {/* in layout to avoid rerendering during state changes*/}
          <ParticlesLayout>{children}</ParticlesLayout>
          <DeveloperShortcut />
        </body>
      </html>
    </ClerkProvider>
  );
}
