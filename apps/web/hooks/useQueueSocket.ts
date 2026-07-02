import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { socket, connectSocket, disconnectSocket } from '../lib/socket';
import { useQueueStore } from '../stores/queue-store';

/**
 * Subscribes to real-time queue events for a specific shopper session.
 *
 * @param eventId  - The event the shopper is queued for.
 * @param sessionId - The shopper's session ID (client-generated, stored in localStorage).
 * @param wsToken  - Short-lived JWT issued by POST /events/:id/join proving ownership
 *                   of the sessionId.  Required to join the shopper-scoped room that
 *                   receives queue:admitted (checkout token).  Without it, the client
 *                   can still receive queue:position_update from the general event room.
 */
export function useQueueSocket(
  eventId: string,
  sessionId: string | null,
  wsToken?: string | null,
) {
  const router = useRouter();
  const setPosition = useQueueStore((state) => state.setPosition);
  const setAdmitted = useQueueStore((state) => state.setAdmitted);
  const setExpired = useQueueStore((state) => state.setExpired);

  useEffect(() => {
    if (!eventId || !sessionId) return;

    connectSocket();

    // Include wsToken when subscribing — without it the gateway will reject
    // the shopper-scoped room join and emit subscribe:error (not a hard disconnect).
    socket.emit('subscribe', { eventId, sessionId, ...(wsToken ? { wsToken } : {}) });

    socket.on('queue:position_update', (data) => {
      // The backend broadcasts a generic payload: { total, etaSeconds, position: queueDepth }
      // where 'position' is a placeholder. As per backend architecture, clients must refetch
      // their personalized position and ETA on this signal.
      import('../lib/api').then(({ api }) => {
        api.get(`/events/${eventId}/position?sessionId=${sessionId}`)
          .then(res => setPosition(res.data))
          .catch(() => {});
      });
    });

    socket.on('queue:admitted', (data) => {
      console.log('[useQueueSocket] Received queue:admitted with data:', data);
      // data: { checkoutToken, expiresAt, entryId }
      setAdmitted(data);
    });

    socket.on('queue:expired', () => {
      setExpired();
    });

    // ── FIX 2: event:sold_out (Phase 25 audit — previously missing) ──────────
    // UX decision: redirect to the event detail page (which renders the SOLD_OUT
    // badge), rather than showing a dead waiting-room state. The event page is
    // already equipped to show "SOLD OUT" status and is less jarring than an
    // in-room modal that the user must then navigate away from.
    socket.on('event:sold_out', () => {
      import('../stores/queue-store').then(({ useQueueStore }) => {
        useQueueStore.getState().setQueueState({ status: 'IDLE' });
      });
      import('sonner').then(({ toast }) => {
        toast.error('This event has sold out. You have been removed from the queue.');
      });
      router.push(`/events/${eventId}`);
    });

    return () => {
      socket.off('queue:position_update');
      socket.off('queue:admitted');
      socket.off('queue:expired');
      socket.off('event:sold_out');
      // Don't disconnect shared socket - navigation to checkout needs it briefly
    };
  }, [eventId, sessionId, wsToken, setPosition, setAdmitted, setExpired, router]);
}
