import { useState } from 'react';

/**
 * Loading + error state for a form button. `run` clears the old error, shows
 * the spinner, and displays whatever message the action returns (null = OK).
 * An unexpected throw shows a generic message instead of failing silently.
 */
export function useFormAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<string | null>) {
    setError(null);
    setLoading(true);
    try {
      setError(await action());
    } catch (err) {
      console.warn('Form action failed', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, setError, run };
}
