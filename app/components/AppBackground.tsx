/**
 * The branded surface every public/member page sits on.
 *
 * Replaced the animated tsparticles field: it cost a client component and an
 * engine bundle on every route to render decoration nobody was looking at while
 * checking in, and it forced this wrapper to be `"use client"` purely to read a
 * CSS variable. A static gradient in the org's own tokens is the same look
 * without the runtime -- and it server-renders.
 */
export default function AppBackground({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative min-h-dvh w-full overflow-hidden"
      style={{
        background:
          "linear-gradient(to bottom, var(--brand-primary), var(--brand-background) 60%)",
      }}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
