"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type ClubOption = { slug: string; name: string };

/**
 * "Find your club" — the landing page's one job.
 *
 * Filtering is client-side over the full list: orgs number in the dozens, the
 * whole set already ships with the page, and a signed-out visitor standing in a
 * hallway should get results on the keystroke rather than on a round trip.
 * If the directory ever outgrows that, this becomes a debounced server query
 * and the markup stays as-is.
 */
export default function ClubFinder({ clubs }: { clubs: ClubOption[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return clubs.slice(0, 3);
    return clubs
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [clubs, q]);

  const listLabel = q ? "Matches" : "Popular";

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-bold">Find your club</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name — “ACM”, “ColorStack”…"
          aria-label="Search for your club by name"
          className="w-full rounded-[var(--radius-control)] border border-white/25 bg-white/10 px-4 py-3.5 text-[15px] text-white outline-none placeholder:text-white/45 focus:border-white/55"
        />
      </label>

      {clubs.length === 0 ? (
        <p className="m-0 text-[13px] leading-relaxed text-white/65">
          No clubs are set up yet. If you run one, ask an admin to add it.
        </p>
      ) : (
        <>
          <p className="m-0 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-white/50 uppercase">
            {listLabel}
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {matches.map((club) => (
              <li key={club.slug}>
                <Link
                  href={`/${club.slug}/checkin`}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-white/15 bg-white/8 px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
                >
                  <span className="min-w-0 truncate">{club.name}</span>
                  <span aria-hidden="true" className="flex-none text-white/45">
                    ›
                  </span>
                </Link>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="rounded-[var(--radius-control)] border border-white/15 px-4 py-3.5 text-[13px] leading-relaxed text-white/65">
                No club matches “{query.trim()}”. Check the spelling, or ask an
                officer for the link on the slide.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
