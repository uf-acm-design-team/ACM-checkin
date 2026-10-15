"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type FeedMode = "off" | "connecting" | "live" | "polling";

export interface AttendanceInsert {
  id: string;
  meeting_id: string;
  attendee_id: string;
  checked_in_at: string;
  source: string | null;
  answers: unknown;
}

const POLL_MS = 10_000;
const SUBSCRIBE_TIMEOUT_MS = 5_000;
// Safety net while Live: a channel can subscribe yet never deliver (e.g. table unpublished).
const CATCH_UP_MS = 60_000;

// Dev-only: append ?feed=poll to the URL to skip Realtime and test polling.
function pollingForced(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return new URLSearchParams(window.location.search).get("feed") === "poll";
}

/**
 * Streams new check-ins for one meeting via Realtime, falling back to polling
 * every 10s if the channel fails or does not subscribe in time, and catching
 * up every 60s while Live. Runs only while `enabled` and the browser tab is
 * visible; catches up on each start.
 */
export function useLiveCheckIns({
  supabase,
  meetingId,
  enabled,
  onInsert,
  onPoll,
}: {
  supabase: SupabaseClient;
  meetingId: string | null;
  enabled: boolean;
  onInsert: (row: AttendanceInsert) => void;
  onPoll: () => void;
}): FeedMode {
  // Set only from channel/timer callbacks; "off" and "connecting" are derived.
  const [settled, setSettled] = useState<"live" | "polling" | null>(null);
  const [visible, setVisible] = useState(true);

  // Latest callbacks without resubscribing on every render.
  const handlers = useRef({ onInsert, onPoll });
  useEffect(() => {
    handlers.current = { onInsert, onPoll };
  });

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const active = enabled && visible && meetingId !== null;

  useEffect(() => {
    if (!active || !meetingId) return;
    const forced = pollingForced();

    let cancelled = false;
    let polling = false;
    let channel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let subscribeTimer: ReturnType<typeof setTimeout> | undefined;
    let catchUpTimer: ReturnType<typeof setInterval> | undefined;

    const dropChannel = () => {
      if (channel) supabase.removeChannel(channel);
      channel = null;
    };

    const startPolling = () => {
      if (cancelled || polling) return;
      polling = true;
      clearTimeout(subscribeTimer);
      clearInterval(catchUpTimer);
      dropChannel();
      if (!forced) setSettled("polling");
      pollTimer = setInterval(() => handlers.current.onPoll(), POLL_MS);
    };

    // Catch up on anything missed while hidden or before subscribing.
    handlers.current.onPoll();

    if (forced) {
      startPolling();
    } else {
      subscribeTimer = setTimeout(startPolling, SUBSCRIBE_TIMEOUT_MS);
      catchUpTimer = setInterval(() => handlers.current.onPoll(), CATCH_UP_MS);
      // Re-read the Clerk token; the client may have been created before Clerk loaded.
      supabase.realtime
        .setAuth()
        .then(() => {
          if (cancelled || polling) return;
          channel = supabase
            .channel(`attendance-feed:${meetingId}:${Math.random().toString(36).slice(2)}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "attendance",
                filter: `meeting_id=eq.${meetingId}`,
              },
              (payload) => handlers.current.onInsert(payload.new as AttendanceInsert),
            )
            .subscribe((status) => {
              if (cancelled || polling) return;
              if (status === "SUBSCRIBED") {
                clearTimeout(subscribeTimer);
                setSettled("live");
              } else {
                // CHANNEL_ERROR, TIMED_OUT, or CLOSED.
                startPolling();
              }
            });
        })
        .catch(startPolling);
    }

    return () => {
      cancelled = true;
      clearTimeout(subscribeTimer);
      clearInterval(pollTimer);
      clearInterval(catchUpTimer);
      dropChannel();
      setSettled(null);
    };
  }, [active, meetingId, supabase]);

  if (!active) return "off";
  if (settled) return settled;
  return typeof window !== "undefined" && pollingForced() ? "polling" : "connecting";
}
