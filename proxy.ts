import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // gets supabase auth user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("[Proxy] Path:", request.nextUrl.pathname);
  console.log(
    "[Proxy] User:",
    user ? `Authenticated (${user.email})` : "Not authenticated"
  );

  // public routes
  const publicRoutes = ["/", "/signup"];
  const isPublicRoute = publicRoutes.some((route) => {
    if (route === "/") {
      return request.nextUrl.pathname === "/";
    }
    return request.nextUrl.pathname.startsWith(route);
  });

  console.log("[Proxy] Is public route:", isPublicRoute);

  if (!user && !isPublicRoute) {
    console.log("[Proxy] Redirecting unauthenticated user to /");
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/") {
    console.log("[Proxy] Redirecting authenticated user to /dashboard");
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes (these handle auth separately)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
