import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import type { Database } from "./database.types";
import { decodeJwtClaims, subjectOf } from "./jwt";

export type TypedSupabaseClient = SupabaseClient<Database>;

export type GetToken = () => Promise<string | null | undefined>;

export type MobileSupabase = {
  client: TypedSupabaseClient;
  clerkId: () => Promise<string | null>;
};

export type SupabaseConfig = {
  url: string;
  anonKey: string;
  fetch?: typeof fetch;
};

export function readSupabaseConfig(): SupabaseConfig {
  const url = env.supabaseUrl;
  const anonKey = env.supabaseAnonKey;
  if (!url || !anonKey) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in mobile/.env.local. See mobile/README.md.",
    );
  }
  return { url, anonKey };
}

export function assertPublicKey(key: string): void {
  const isSecretKey =
    key.startsWith("sb_secret_") || decodeJwtClaims(key)?.role === "service_role";
  if (isSecretKey) {
    throw new Error(
      "Refusing to create the mobile Supabase client with a service-role key. Use the anon (publishable) key.",
    );
  }
}

export function createSupabase(
  getToken: GetToken,
  config: SupabaseConfig = readSupabaseConfig(),
): MobileSupabase {
  assertPublicKey(config.anonKey);

  const accessToken = async () => (await getToken()) ?? null;

  const client = createClient<Database>(config.url, config.anonKey, {
    accessToken,
    ...(config.fetch ? { global: { fetch: config.fetch } } : {}),
  });

  return {
    client,
    clerkId: async () => subjectOf(await accessToken()),
  };
}
