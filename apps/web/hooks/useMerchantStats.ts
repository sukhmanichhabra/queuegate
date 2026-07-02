"use client";

import { useEffect, useRef, useState } from "react";
import { socket, connectSocket } from "@/lib/socket";
import { api } from "@/lib/api";

interface MerchantStats {
  queueDepth: number;
  admissionRate: number;
  throttleActive: boolean;
  ticketsSold: number;
  admittedNow: number;
  totalProcessed: number;
  revenue: number;
  capacity: number;
}

/**
 * Subscribes to real-time merchant stats for a specific event.
 *
 * Auth: reads the accessToken from localStorage and passes it to
 * connectSocket() so the WS gateway can verify the MERCHANT_ADMIN
 * role and grant access to the event:{id}:merchant room.
 *
 * Fallback: if the WS subscription fails (e.g. token missing or expired),
 * a 5-second REST poll against GET /merchants/events/:id/stats keeps the
 * queue depth visible.
 */
export function useMerchantStats(eventId: string) {
  const [stats, setStats] = useState<MerchantStats>({
    queueDepth: 0,
    admissionRate: 0,
    throttleActive: false,
    ticketsSold: 0,
    admittedNow: 0,
    totalProcessed: 0,
    revenue: 0,
    capacity: 0,
  });
  const [rateHistory, setRateHistory] = useState<
    { time: string; rate: number }[]
  >([]);
  const bufferRef = useRef<{ time: string; rate: number }[]>([]);
  
  // Track whether we've received at least one WS update so the polling
  // fallback can yield priority to the live stream when it's working.
  const wsReceivedRef = useRef(false);
  const [hasLiveStats, setHasLiveStats] = useState(false);

  // ── REST polling fallback ────────────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return;

    const poll = async () => {
      // Only poll when WebSocket hasn't delivered a recent update
      if (wsReceivedRef.current) return;
      try {
        const res = await api.get(`/merchants/events/${eventId}/stats`);
        const data = res.data;
        console.log("REST payload:", data);
        setStats({
          queueDepth: data.queueDepth ?? 0,
          admissionRate: data.admissionRatePerMin ?? 0,
          throttleActive: data.throttleActive ?? false,
          ticketsSold: data.ticketsSold ?? 0,
          admittedNow: data.admittedNow ?? 0,
          totalProcessed: data.totalProcessed ?? 0,
          revenue: data.revenue ?? 0,
          capacity: data.capacity ?? 0,
        });
        setHasLiveStats(true);
      } catch {
        // silently ignore — WS may still be working
      }
    };

    // Poll immediately, then every 5 s
    poll();
    const pollInterval = setInterval(poll, 5000);
    return () => clearInterval(pollInterval);
  }, [eventId]);

  // ── WebSocket real-time stream ───────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return;

    // Read the merchant's access token so the gateway can verify the
    // MERCHANT_ADMIN role and grant the event:{id}:merchant room.
    const accessToken =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken") ?? undefined
        : undefined;

    // Helper: emit subscribe once connected
    const doSubscribe = () => {
      socket.emit("subscribe", { eventId, role: "merchant" });
    };

    connectSocket(accessToken);

    // If already connected after connectSocket, subscribe immediately.
    // Otherwise wait for the connect event (handles reconnect after auth upgrade).
    if (socket.connected) {
      doSubscribe();
    } else {
      socket.once("connect", doSubscribe);
    }

    socket.on("merchant:live_stats", (data: MerchantStats) => {
      console.log("WebSocket payload:", data);
      wsReceivedRef.current = true;
      setHasLiveStats(true);
      setStats(data);

      const point = {
        time: new Date().toLocaleTimeString("en-US", {
          hour12: false,
          minute: "2-digit",
          second: "2-digit",
        }),
        rate: data.admissionRate,
      };

      bufferRef.current = [...bufferRef.current.slice(-149), point];
      setRateHistory([...bufferRef.current]);
    });

    return () => {
      socket.off("connect", doSubscribe);
      socket.off("merchant:live_stats");
      // Don't disconnect the shared socket - other components may use it
    };
  }, [eventId]);

  return { stats, rateHistory, hasLiveStats };
}
