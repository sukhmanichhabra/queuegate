"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/glass/GlassCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { socket, connectSocket, disconnectSocket } from "@/lib/socket";

type HealthState = "HEALTHY" | "DEGRADED";

export default function AdminEventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const eventId = params.id;
  const queryClient = useQueryClient();
  const [healthState, setHealthState] = useState<HealthState>("HEALTHY");
  const [injecting, setInjecting] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Fetch event
  const { data: event } = useQuery({
    queryKey: ["admin-event", eventId],
    queryFn: async () => {
      const res = await api.get(`/events/${eventId}`);
      return res.data;
    },
  });

  // Fetch rate logs
  const { data: rateLogs } = useQuery({
    queryKey: ["admin-rate-logs", eventId],
    queryFn: async () => {
      const res = await api.get(`/admin/events/${eventId}/rate-log`);
      return res.data as any[];
    },
    refetchInterval: 5000,
  });

  // Subscribe to admin:throttle_event WS to trigger refetch
  useEffect(() => {
    connectSocket();
    socket.emit("subscribe", { eventId, role: "admin" });

    socket.on("admin:throttle_event", () => {
      setHealthState("DEGRADED");
      queryClient.invalidateQueries({ queryKey: ["admin-rate-logs", eventId] });
    });

    // Also listen to merchant stats for recovery detection
    socket.emit("subscribe", { eventId, role: "merchant" });
    socket.on("merchant:live_stats", (data: any) => {
      if (data.throttleActive === false && healthState === "DEGRADED") {
        setHealthState("HEALTHY");
      }
    });

    return () => {
      socket.off("admin:throttle_event");
      socket.off("merchant:live_stats");
      disconnectSocket();
    };
  }, [eventId, healthState, queryClient]);

  const handleInjectFailure = useCallback(async () => {
    setInjecting(true);
    try {
      await api.post("/mock-checkout/inject-failure", { eventId });
      setHealthState("DEGRADED");
      toast.error("Failure injected — checkout service is now DEGRADED.");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to inject.");
    }
    setInjecting(false);
  }, [eventId]);

  const handleClearFailure = useCallback(async () => {
    setClearing(true);
    try {
      await api.post("/mock-checkout/clear-failure", { eventId });
      setHealthState("HEALTHY");
      queryClient.invalidateQueries({ queryKey: ["admin-rate-logs", eventId] });
      toast.success("Failure cleared — checkout service restored to HEALTHY.");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to clear.");
    }
    setClearing(false);
  }, [eventId, queryClient]);

  const isHealthy = healthState === "HEALTHY";

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="container mx-auto px-4 py-16 max-w-5xl">
        {/* Header */}
        <h1 className="text-3xl font-extrabold mb-2">
          Ops Admin — {event?.title || "Event"}
        </h1>
        <p className="text-[var(--text-muted)] mb-10">
          Health status control and admission rate audit trail.
        </p>

        {/* ─── Health Status Card ─── */}
        <motion.div
          animate={{
            backgroundColor: isHealthy
              ? "rgba(16, 185, 129, 0.08)"
              : "rgba(239, 68, 68, 0.08)",
          }}
          transition={{ duration: 0.6 }}
          className={cn(
            "rounded-2xl border backdrop-blur-md p-12 mb-8 flex flex-col items-center justify-center min-h-[280px] relative overflow-hidden",
            isHealthy
              ? "border-green-500/20 shadow-[0_0_40px_rgba(16,185,129,0.1)]"
              : "border-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.1)]"
          )}
        >
          {/* Animated Pulse Ring */}
          <div className="relative mb-6">
            <motion.div
              animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className={cn(
                "absolute inset-0 rounded-full",
                isHealthy ? "bg-green-500/30" : "bg-red-500/30"
              )}
              style={{ width: 24, height: 24 }}
            />
            <div
              className={cn(
                "w-6 h-6 rounded-full relative z-10",
                isHealthy ? "bg-green-500" : "bg-red-500"
              )}
            />
          </div>

          {/* Status Text with AnimatePresence */}
          <AnimatePresence mode="wait">
            <motion.h2
              key={healthState}
              initial={{ rotateX: -90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={{ rotateX: 90, opacity: 0 }}
              transition={{ type: "spring", damping: 15, stiffness: 100 }}
              className={cn(
                "text-5xl md:text-6xl font-black tracking-tight",
                isHealthy ? "text-green-400" : "text-red-400"
              )}
            >
              {healthState}
            </motion.h2>
          </AnimatePresence>

          <p className="text-[var(--text-muted)] mt-4 text-sm">
            {isHealthy
              ? "Checkout service is operating normally."
              : "Checkout service is degraded. Auto-throttle is active."}
          </p>
        </motion.div>

        {/* ─── Control Buttons ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={handleInjectFailure}
              disabled={injecting || !isHealthy}
              className={cn(
                "w-full rounded-xl py-6 text-lg font-bold transition-all",
                "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30",
                !isHealthy && "opacity-40 cursor-not-allowed",
                isHealthy && "shadow-[0_0_20px_rgba(239,68,68,0.2)]"
              )}
            >
              {injecting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                  Injecting...
                </span>
              ) : (
                "💥 Inject Failure"
              )}
            </Button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={handleClearFailure}
              disabled={clearing || isHealthy}
              className={cn(
                "w-full rounded-xl py-6 text-lg font-bold transition-all",
                "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30",
                isHealthy && "opacity-40 cursor-not-allowed",
                !isHealthy && "shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              )}
            >
              {clearing ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                  Clearing...
                </span>
              ) : (
                "✅ Clear Failure"
              )}
            </Button>
          </motion.div>
        </div>

        {/* ─── Admission Rate Log Table ─── */}
        <GlassCard className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--glass-border)]">
            <h3 className="font-bold">Admission Rate Log</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Last 20 rate changes — auto-refreshes every 5 seconds
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--glass-border)]">
                  <th className="px-6 py-3 text-[var(--text-muted)] font-medium">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-[var(--text-muted)] font-medium">
                    Rate (per min)
                  </th>
                  <th className="px-6 py-3 text-[var(--text-muted)] font-medium">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-[var(--text-muted)] font-medium">
                    Δ Change
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {rateLogs && rateLogs.length > 0 ? (
                    rateLogs.map((log: any, i: number) => {
                      const prevRate =
                        i < rateLogs.length - 1 ? rateLogs[i + 1]?.rate : null;
                      const delta =
                        prevRate !== null && prevRate !== undefined
                          ? log.rate - prevRate
                          : null;
                      const isThrottle = log.reason === "auto_throttle";

                      return (
                        <motion.tr
                          key={log.id || i}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className={cn(
                            "border-b border-[var(--glass-border)]",
                            isThrottle && "border-l-4 border-l-yellow-500"
                          )}
                        >
                          <td className="px-6 py-3 text-[var(--text-muted)] tabular-nums">
                            {log.changed_at
                              ? new Date(log.changed_at).toLocaleString()
                              : "—"}
                          </td>
                          <td className="px-6 py-3 tabular-nums font-mono font-bold">
                            {log.rate}
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className={
                                isThrottle
                                  ? "text-yellow-400 font-semibold"
                                  : "text-[var(--text-muted)]"
                              }
                            >
                              {log.reason}
                            </span>
                          </td>
                          <td className="px-6 py-3 tabular-nums">
                            {delta !== null ? (
                              <span
                                className={cn(
                                  "font-mono font-bold",
                                  delta > 0
                                    ? "text-green-400"
                                    : delta < 0
                                    ? "text-red-400"
                                    : "text-[var(--text-muted)]"
                                )}
                              >
                                {delta > 0 ? "+" : ""}
                                {delta}
                              </span>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-12 text-center text-[var(--text-muted)]"
                      >
                        No rate changes recorded yet. Inject a failure to
                        trigger the auto-throttle.
                      </td>
                    </tr>
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </main>
  );
}
