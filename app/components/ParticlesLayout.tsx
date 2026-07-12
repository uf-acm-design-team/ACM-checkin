"use client";

import { useEffect, useState, memo, useMemo } from "react";
import { usePathname } from "next/navigation";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine } from "@tsparticles/engine";

const FALLBACK_PARTICLE_COLOR = "#ffffff";

function readParticleColor(): string {
  if (typeof window === "undefined") return FALLBACK_PARTICLE_COLOR;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--particle-color")
    .trim();
  return value || FALLBACK_PARTICLE_COLOR;
}

const ParticlesBackground = memo(({ color }: { color: string }) => {
  const options = useMemo(
    () => ({
      fpsLimit: 120,
      interactivity: {
        events: {
          onClick: { enable: true, mode: "push" as const },
          onHover: { enable: true, mode: "repulse" as const },
        },
        modes: {
          push: { quantity: 1 },
          repulse: { distance: 150, duration: 0.3 },
        },
      },
      particles: {
        color: { value: color },
        links: {
          color,
          distance: 150,
          enable: true,
          opacity: 0.5,
          width: 1,
        },
        move: {
          direction: "none" as const,
          enable: true,
          outModes: { default: "bounce" as const },
          random: false,
          speed: 2,
          straight: false,
        },
        number: {
          density: { enable: true },
          value: 200,
        },
        opacity: { value: 0.5 },
        shape: { type: "triangle" as const },
        size: { value: { min: 3, max: 7 } },
      },
      detectRetina: true,
    }),
    [color]
  );

  return <Particles id="tsparticles" options={options} className="absolute inset-0" />;
});

ParticlesBackground.displayName = "ParticlesBackground";

export default function ParticlesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [init, setInit] = useState(false);
  const pathname = usePathname();
  const [particleColor, setParticleColor] = useState(FALLBACK_PARTICLE_COLOR);

  useEffect(() => {
    initParticlesEngine(async (engine: Engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  // Re-read the injected --particle-color whenever the route (and thus the
  // active org's :root vars) changes.
  useEffect(() => {
    setParticleColor(readParticleColor());
  }, [pathname]);

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{
        background:
          "linear-gradient(to bottom, var(--brand-primary), var(--brand-background) 60%)",
      }}
    >
      {init && <ParticlesBackground color={particleColor} />}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
