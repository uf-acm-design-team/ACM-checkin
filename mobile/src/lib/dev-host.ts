/**
 * Makes a "localhost" Supabase URL reachable from a phone during development.
 *
 * `127.0.0.1` on a phone means the phone itself, and the laptop's Wi-Fi
 * address changes whenever it reconnects. But in development the app already
 * knows a working laptop address: the one it downloaded its code from (Expo's
 * hostUri, e.g. "10.136.250.134:8081"). So when EXPO_PUBLIC_SUPABASE_URL
 * points at localhost, swap in that host and keep the Supabase port.
 *
 * Left untouched:
 * - production builds (no dev server)
 * - a real remote URL (e.g. https://xyz.supabase.co)
 * - tunnel mode: the host is "*.exp.direct", which only forwards the app's
 *   own port, not Supabase's -- the onboarding check then fails open
 */

const LOCALHOST_NAMES = new Set(['127.0.0.1', 'localhost', '0.0.0.0', '::1', '[::1]']);

/** True for IPv4 addresses and plain LAN names -- hosts the phone reached directly. */
function isDirectHost(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return !host.includes('.') || host.endsWith('.local');
}

export function resolveDevSupabaseUrl(
  configuredUrl: string | undefined,
  devServerHostUri: string | undefined,
  isDev: boolean,
): string | undefined {
  if (!configuredUrl || !isDev || !devServerHostUri) return configuredUrl;

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    return configuredUrl;
  }
  if (!LOCALHOST_NAMES.has(url.hostname)) return configuredUrl;

  // hostUri is "host:port" (no scheme); drop the port -- it's Metro's, not Supabase's.
  const devHost = devServerHostUri.split('/')[0].replace(/:\d+$/, '');
  if (!devHost || !isDirectHost(devHost) || LOCALHOST_NAMES.has(devHost)) return configuredUrl;

  url.hostname = devHost;
  return url.toString().replace(/\/$/, '');
}
