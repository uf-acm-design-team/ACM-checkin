"use client";

import { useEffect, useState, memo } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine } from "@tsparticles/engine";

const particlesOptions = {
  fpsLimit: 120,
  interactivity: {
    events: {
      onClick: {
        enable: true,
        mode: "push" as const,
      },
      onHover: {
        enable: true,
        mode: "repulse" as const,
      },
    },
    modes: {
      push: {
        quantity: 1,
      },
      repulse: {
        distance: 150,
        duration: 0.3,
      },
    },
  },
  particles: {
    color: {
      value: "#ffffff",
    },
    links: {
      color: "#ffffff",
      distance: 150,
      enable: true,
      opacity: 0.5,
      width: 1,
    },
    move: {
      direction: "none" as const,
      enable: true,
      outModes: {
        default: "bounce" as const,
      },
      random: false,
      speed: 2,
      straight: false,
    },
    number: {
      density: {
        enable: true,
      },
      value: 200,
    },
    opacity: {
      value: 0.5,
    },
    shape: {
      type: "triangle" as const,
    },
    size: {
      value: { min: 3, max: 7 },
    },
  },
  detectRetina: true,
};

const ParticlesBackground = memo(() => {
  return (
    <Particles
      id="tsparticles"
      options={particlesOptions}
      className="absolute inset-0"
    />
  );
});

ParticlesBackground.displayName = "ParticlesBackground";

export default function ParticlesLayout({
  children,
  fromColor = "#FA4616",
  toColor = "#0021A5",
}: {
  children: React.ReactNode;
  fromColor?: string;
  toColor?: string;
}) {
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine: Engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{ background: `linear-gradient(to bottom right, ${fromColor}, ${toColor})` }}
    >
      {init && <ParticlesBackground />}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
