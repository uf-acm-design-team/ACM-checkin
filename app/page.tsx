"use client";

import { useUser, RedirectToSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function Home() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // If signed in, redirect to dashboard
  if (isSignedIn) {
    router.push("/dashboard");
    return null;
  }

  // If not signed in, show Clerk sign-in
  return <RedirectToSignIn />;
}
