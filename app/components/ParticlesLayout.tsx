"use client";

import { useEffect, useState, memo, useMemo } from "react";
import { usePathname } from "next/navigation";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine } from "@tsparticles/engine";

export type ParticlesTheme = "main" | "aed";

const themes = {
  main: {
    gradient: "linear-gradient(to bottom right, #FA4616, #F58025, #0021A5)",
    particleColor: "#ffffff",
    linkColor: "#ffffff",
  },
  aed: {
    gradient: "linear-gradient(to bottom, #b65d5f, #1f1919 60%)",
    particleColor: "#b65d5f",
    linkColor: "#b65d5f",
  },
};

const ParticlesBackground = memo(({ themeConfig }: { themeConfig: typeof themes.main }) => {
  const options = useMemo(() => ({
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
      color: { value: themeConfig.particleColor },
      links: {
        color: themeConfig.linkColor,
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
  }), [themeConfig]);

  return (
    <Particles
      id="tsparticles"
      options={options}
      className="absolute inset-0"
    />
  );
});

ParticlesBackground.displayName = "ParticlesBackground";

export default function ParticlesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [init, setInit] = useState(false);
  const pathname = usePathname();
  const theme = pathname?.startsWith("/aed-checkin") ? "aed" : "main";
  const themeConfig = themes[theme];

  useEffect(() => {
    initParticlesEngine(async (engine: Engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  return (
    <div 
      className="relative min-h-screen w-full"
      style={{ background: themeConfig.gradient }}
    >
      {init && <ParticlesBackground themeConfig={themeConfig} />}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
