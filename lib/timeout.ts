/**
 * Reject if `promise` hasn't settled within `ms`.
 *
 * Used around check-in submits so a request lost on a slow network lands on
 * the network-error screen instead of leaving the button spinning. The
 * underlying request is not cancelled (server actions can't be), so a
 * check-in may still land after the timeout; a retry then comes back as
 * "already checked in".
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no response after ${Math.round(ms / 1000)}s`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
