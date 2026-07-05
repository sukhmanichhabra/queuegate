import { io, Socket } from 'socket.io-client';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

/**
 * Singleton Socket.IO client for the /ws namespace.
 *
 * Auth flow:
 * - Merchants/admins: call connectSocket(accessToken) to attach their JWT
 *   to socket.handshake.auth.token before connecting.  The gateway verifies
 *   this at connection time and attaches the decoded user to the socket,
 *   enabling merchant/admin room joins.
 * - Shoppers: call connectSocket() (no token) — the gateway allows the
 *   connection and they use a per-session wsToken when emitting 'subscribe'.
 */
export const socket: Socket = io(`${WS_BASE}/ws`, {
  autoConnect: false,
  transports: ['websocket'],
});

export const connectSocket = (accessToken?: string) => {
  if (accessToken) {
    const currentToken = (socket.auth as Record<string, string>)?.token;
    // If we're upgrading to an authenticated session (new/different token),
    // we must disconnect and reconnect so the token lands in the handshake.
    // The gateway only reads handshake.auth at connection time.
    if (currentToken !== accessToken && socket.connected) {
      socket.disconnect();
    }
    socket.auth = { token: accessToken };
  }
  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};
