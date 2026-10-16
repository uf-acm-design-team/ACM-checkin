import Constants from 'expo-constants';

import { resolveDevSupabaseUrl } from './dev-host';

/**
 * Public config baked into the app at bundle time from mobile/.env.local.
 * Every EXPO_PUBLIC_* value ships inside the app, so only public keys belong here.
 */
export const env = {
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  // Leave EXPO_PUBLIC_SUPABASE_URL as http://127.0.0.1:54321 for local
  // Supabase: in development it's pointed at your laptop automatically.
  supabaseUrl: resolveDevSupabaseUrl(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    Constants.expoConfig?.hostUri,
    __DEV__,
  ),
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};
