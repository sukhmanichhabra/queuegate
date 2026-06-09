import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { TokenBlocklistService } from '../auth/token-blocklist.service';
import { ALLOWED_ORIGINS } from '../cors.config';
import { requireEnv } from '../env';

/**
 * QueueGateway — WebSocket gateway for real-time queue events.
 *
 * Auth model:
 *  - General room  (event:{eventId})                   → open; any connected client
 *  - Shopper room  (event:{eventId}:shopper:{sid})     → requires valid wsToken from POST /join
 *  - Merchant room (event:{eventId}:merchant)          → requires MERCHANT_ADMIN JWT for that event's merchant
 *  - Admin room    (event:{eventId}:admin)             → requires OPS_ADMIN JWT
 *
 * On failed sub-room auth: emit 'subscribe:error' back to the requesting client;
 * do NOT disconnect the socket so other valid subscriptions on the same connection
 * remain unaffected (e.g. a shopper losing a wsToken only loses the shopper-scoped
 * room, not the general position-update room).
 */
@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
})
export class QueueGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(QueueGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly tokenBlocklist: TokenBlocklistService,
  ) {}

  // ── Connection-time handshake ────────────────────────────────────────────────
  /**
   * Runs synchronously when a socket connects.
   * Reads socket.handshake.auth.token (the HTTP access JWT sent by the frontend)
   * and, if valid, loads the full user+roles record and attaches it to
   * client.data.user.  Invalid / missing token → client.data.user = null (not
   * kicked — shoppers legitimately connect without a user JWT).
   */
  async handleConnection(client: Socket) {
    const token: string | undefined = client.handshake.auth?.token;

    if (!token) {
      client.data.user = null;
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: requireEnv('JWT_ACCESS_SECRET'),
      });

      // Blocklist check — reject tokens revoked at logout before natural expiry.
      if (await this.tokenBlocklist.isRevoked(payload.jti)) {
        client.data.user = null;
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { roles: true },
      });

      client.data.user = user ?? null;
    } catch {
      // Expired, revoked, or invalid access token — still allow connection
      // (shoppers legitimately connect without a user JWT).
      client.data.user = null;
    }
  }

  /**
   * Resolves the authenticated user for a socket, using client.data.user if
   * already set by handleConnection, or lazily verifying the handshake token.
   * This handles the race where Socket.IO NestJS does not await handleConnection
   * before firing message handlers, so handleSubscribe can arrive before
   * handleConnection's async DB lookup completes.
   */
  private async resolveUser(client: Socket): Promise<any | null> {
    // Fast path: already resolved by handleConnection
    if (client.data.user !== undefined) {
      return client.data.user;
    }

    // Slow path: handleConnection hasn't finished yet (or connection had no token)
    const token: string | undefined = client.handshake.auth?.token;
    if (!token) {
      client.data.user = null;
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: requireEnv('JWT_ACCESS_SECRET'),
      });

      // Blocklist check — same guard as handleConnection and JwtStrategy.
      if (await this.tokenBlocklist.isRevoked(payload.jti)) {
        client.data.user = null;
        return null;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { roles: true },
      });
      client.data.user = user ?? null;
      return client.data.user;
    } catch {
      client.data.user = null;
      return null;
    }
  }

  // ── Subscribe handler ────────────────────────────────────────────────────────
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody()
    data: {
      eventId: string;
      sessionId?: string;
      wsToken?: string;
      role?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data.eventId) return;

    // 1. General event room — always allowed (position updates, no PII)
    client.join(`event:${data.eventId}`);

    // 2. Shopper-specific room — requires valid wsToken issued by POST /join
    if (data.sessionId) {
      await this.joinShopperRoom(client, data.eventId, data.sessionId, data.wsToken);
    }

    // 3. Merchant room — requires MERCHANT_ADMIN JWT for this event's merchant
    if (data.role === 'merchant') {
      await this.joinMerchantRoom(client, data.eventId);
    }

    // 4. Admin room — requires OPS_ADMIN JWT
    if (data.role === 'admin') {
      await this.joinAdminRoom(client, data.eventId);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Verifies the wsToken (issued by AdmissionService.joinQueue) and joins
   * the shopper-scoped room if it is valid and matches {eventId, sessionId}.
   *
   * Token expiry behaviour:
   *   - The check is performed only at subscribe time, not continuously.
   *   - Once joined, the client stays in the room for the socket's lifetime even
   *     if the token would now be expired.
   *   - If the client disconnects and reconnects after the 5-min window, they
   *     must obtain a fresh token via POST /events/:id/join (which also works
   *     when EXPIRED entries are cleaned up) or a dedicated refresh endpoint.
   *   - The general event room (position updates) is NOT gated — only the
   *     shopper-specific room (checkout tokens) is.
   */
  private async joinShopperRoom(
    client: Socket,
    eventId: string,
    sessionId: string,
    wsToken: string | undefined,
  ) {
    if (!wsToken) {
      this.emitSubscribeError(client, 'shopper', 'wsToken required to join shopper room');
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(wsToken, {
        secret: requireEnv('JWT_WS_SECRET'),
      });

      // Strict payload match — prevent token reuse across sessions/events
      if (payload.eventId !== eventId || payload.sessionId !== sessionId) {
        this.emitSubscribeError(client, 'shopper', 'wsToken does not match eventId/sessionId');
        return;
      }

      client.join(`event:${eventId}:shopper:${sessionId}`);
    } catch {
      this.emitSubscribeError(client, 'shopper', 'wsToken invalid or expired');
    }
  }

  /**
   * Verifies the connected socket's user has MERCHANT_ADMIN role AND
   * owns the specific event (same ownership check as MerchantService.getEvent).
   */
  private async joinMerchantRoom(client: Socket, eventId: string) {
    const user = await this.resolveUser(client);
    if (!user) {
      this.emitSubscribeError(client, 'merchant', 'Authentication required');
      return;
    }

    const merchantRole = user.roles?.find((r: any) => r.role === 'MERCHANT_ADMIN');
    if (!merchantRole) {
      this.emitSubscribeError(client, 'merchant', 'MERCHANT_ADMIN role required');
      return;
    }

    // Verify the event is owned by this merchant (mirrors MerchantService.getEvent)
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.merchant_id !== merchantRole.merchant_id) {
      this.emitSubscribeError(client, 'merchant', 'Event not found or not owned by your merchant');
      return;
    }

    client.join(`event:${eventId}:merchant`);
  }

  /**
   * Verifies OPS_ADMIN role from the connection-time JWT.
   */
  private async joinAdminRoom(client: Socket, eventId: string) {
    const user = await this.resolveUser(client);
    if (!user) {
      this.emitSubscribeError(client, 'admin', 'Authentication required');
      return;
    }

    const isAdmin = user.roles?.some((r: any) => r.role === 'OPS_ADMIN');
    if (!isAdmin) {
      this.emitSubscribeError(client, 'admin', 'OPS_ADMIN role required');
      return;
    }

    client.join(`event:${eventId}:admin`);
  }

  private emitSubscribeError(client: Socket, room: string, reason: string) {
    this.logger.warn(`subscribe:error [${room}] ${reason} — socket ${client.id}`);
    client.emit('subscribe:error', { room, reason });
  }

  // ── Emit helpers (called by workers/services) ────────────────────────────────

  emitAdmitted(eventId: string, sessionId: string, data: { checkoutToken: string, expiresAt: string, entryId: string }) {
    this.server.to(`event:${eventId}:shopper:${sessionId}`).emit('queue:admitted', data);
  }

  emitMerchantStats(eventId: string, data: {
    queueDepth: number;
    admissionRate: number;
    throttleActive: boolean;
    ticketsSold: number;
    admittedNow: number;
    totalProcessed: number;
    revenue: number;
    capacity: number;
  }) {
    this.server.to(`event:${eventId}:merchant`).emit('merchant:live_stats', data);
  }

  emitThrottleEvent(eventId: string, data: { eventId: string, reason: string, newRate: number }) {
    this.server.to(`event:${eventId}:admin`).emit('admin:throttle_event', data);
  }
}
