import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/(.*)/checkin", // guest check-in is public
]);

// Routes a signed-in user may visit before completing their attendee profile.
// /onboarding itself must be reachable or the redirect below would loop.
const isOnboardingExempt = createRouteMatcher([
  "/onboarding(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/(.*)/checkin",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  // Force profile completion before the rest of the app.
  //
  // Clerk's SIGN_UP_FORCE_REDIRECT_URL only fires once, at sign-up. Anyone who
  // signed up before /onboarding existed -- or who abandoned the form -- lands
  // on /dashboard with no `attendees` row, and every downstream
  // .maybeSingle() on attendees returns null.
  //
  // This asks the database directly rather than reading a Clerk session claim.
  // An earlier version checked `sessionClaims.publicMetadata.onboardingComplete`,
  // which does NOT work: publicMetadata is not a default session-token claim,
  // so the value was always undefined and EVERY signed-in user was redirected
  // here forever -- even after successfully onboarding. Surfacing that would
  // have required a session-token customization in the Clerk dashboard, i.e.
  // config that lives outside this repo and silently breaks the app when absent.
  //
  // `attendees` is the actual source of truth for "has a profile", so query it.
  // The cost is one indexed lookup on attendees.user_id (unique index added in
  // 20260813000000) per navigation, and only for signed-in users on
  // non-exempt routes.
  const { userId, getToken } = await auth();

  if (userId && !isOnboardingExempt(request)) {
    let hasProfile = false;

    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/attendees` +
          `?select=id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          cache: "no-store",
        },
      );

      if (res.ok) {
        hasProfile = ((await res.json()) as unknown[]).length > 0;
      } else {
        // A failed lookup must not lock the user out of the whole app -- that
        // turns a transient Supabase/JWT problem into an inescapable redirect
        // loop. Fail open: the pages themselves still handle a missing profile.
        console.error("Onboarding gate: attendee lookup failed", res.status);
        hasProfile = true;
      }
    } catch (err) {
      console.error("Onboarding gate: attendee lookup threw", err);
      hasProfile = true;
    }

    if (!hasProfile) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes (these handle auth separately)
     * Feel free to modify this pattern to include more paths.
     *
     * An empty matcher array means this proxy never runs, so auth.protect()
     * above is dead code and every route is publicly reachable. Keep at least
     * one pattern here.
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
