import "react-native-url-polyfill/auto";
import { getClerkInstance, useAuth } from "@clerk/expo";
import { createSupabase, type MobileSupabase } from "./client";

let shared: MobileSupabase | null = null;

function getSharedSupabase(): MobileSupabase {
  shared ??= createSupabase(async () => getClerkInstance().session?.getToken());
  return shared;
}

export function useSupabase(): MobileSupabase | null {
  const { isLoaded, isSignedIn } = useAuth();
  return isLoaded && isSignedIn ? getSharedSupabase() : null;
}
