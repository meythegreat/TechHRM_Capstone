import { useEffect } from 'react';
import { chatService } from '../services/chatService';

/**
 * Keeps the signed-in user marked online for the whole app session,
 * not only while the Messages page is open.
 */
export default function ChatPresence({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const beat = () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      void chatService.heartbeat().catch(() => undefined);
    };

    beat();
    const interval = window.setInterval(beat, 25000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return null;
}
