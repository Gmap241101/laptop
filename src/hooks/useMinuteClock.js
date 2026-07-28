import { useEffect, useState } from 'react';

export default function useMinuteClock({
  enabled = true,
  intervalMs = 60_000,
} = {}) {
  const [nowMs, setNowMs] = useState(Date.now);

  useEffect(() => {
    if (!enabled) return undefined;

    const updateNow = () => setNowMs(Date.now());
    updateNow();

    const intervalId = window.setInterval(updateNow, intervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') updateNow();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, intervalMs]);

  return nowMs;
}
