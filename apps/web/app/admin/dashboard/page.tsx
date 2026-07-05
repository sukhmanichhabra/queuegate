"use client";

/**
 * Admin Dashboard — OPS_ADMIN only
 *
 * Real data sources:
 *   - Events:       GET /admin/events (cross-merchant, requires OPS_ADMIN JWT)
 *   - Kafka health: GET /admin/kafka-health (consumer connection state)
 *   - Rate logs:    GET /admin/events/:id/rate-log (AdmissionRateLog rows, per event)
 *   - Failure ops:  POST /mock-checkout/inject-failure | clear-failure
 *
 * Route guard: useRoleGuard('OPS_ADMIN') — redirects anyone without OPS_ADMIN role.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, animate } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { GlassBadge } from "@/components/glass/GlassBadge";
import { toast } from "sonner";
import { Filter, ArrowUpRight, ShieldAlert } from "lucide-react";

/* ── Animated counter (Bebas Neue odometer) ── */
function OdometerStat({ value, label }: { value: number; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controls = animate(0, value, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate(v) {
        node.textContent = Math.round(v).toLocaleString();
      },
    });
    return () => controls.stop();
  }, [value]);

  return (
    <div className="glass-panel p-6 rounded-xl flex flex-col items-center justify-center text-center border border-white/[0.05] shadow-lg">
      <span
        ref={ref}
        className="font-[family-name:var(--font-bebas)] text-5xl sm:text-6xl text-white leading-none tracking-tight mb-2 text-glow"
      >
        0
      </span>
      <span className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}

/* ── Log Level styling ── */
type LogLevel = "CRIT" | "WARN" | "INFO" | "OK";

const LOG_LEVEL_CLS: Record<LogLevel, { row: string; badge: string }> = {
  CRIT: {
    row: "border-b border-white/[0.05] bg-[#93000a]/10 hover:bg-[#93000a]/20 transition-colors",
    badge: "bg-[#93000a]/20 text-[#ffb4ab] border border-[#e11d48]/20",
  },
  WARN: {
    row: "border-b border-white/[0.05] bg-[#ee9800]/5 hover:bg-[#ee9800]/15 transition-colors",
    badge: "bg-[#ee9800]/10 text-[#ffb95f] border border-[#ffb95f]/20",
  },
  OK: {
    row: "border-b border-white/[0.05] bg-[#00b87c]/5 hover:bg-[#00b87c]/15 transition-colors",
    badge: "bg-[#00b87c]/15 text-[#00b87c] border border-[#00b87c]/30",
  },
  INFO: {
    row: "border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors",
    badge: "bg-[#262b2e]/50 text-[#dfe3e7] border border-white/[0.08]",
  },
};

function AdminLogRow({
  ts,
  level,
  msg,
}: {
  ts: string;
  level: LogLevel;
  msg: string;
}) {
  const cls = LOG_LEVEL_CLS[level];
  return (
    <motion.tr
      initial={{ opacity: 0, height: 0, y: -10 }}
      animate={{ opacity: 1, height: "auto", y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35 }}
      className={cls.row}
    >
      <td className="px-4 py-3 font-mono text-[10px] text-[#9ca3af] font-bold w-20">
        {ts}
      </td>
      <td className="px-2 py-3 w-16">
        <span
          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${cls.badge}`}
        >
          {level}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-white/90">{msg}</td>
    </motion.tr>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { isAuthorized } = useRoleGuard("OPS_ADMIN");

  // Uptime stopwatch
  const [uptime, setUptime] = useState({ h: 0, m: 0, s: 0 });
  useEffect(() => {
    const sw = setInterval(() => {
      setUptime((prev) => {
        if (prev.s < 59) return { ...prev, s: prev.s + 1 };
        if (prev.m < 59) return { ...prev, m: prev.m + 1, s: 0 };
        return { h: prev.h + 1, m: 0, s: 0 };
      });
    }, 1000);
    return () => clearInterval(sw);
  }, []);
  const pad = (n: number) => n.toString().padStart(2, "0");

  // Failure injection state
  const [failureEventId, setFailureEventId] = useState("");
  const [failureActive, setFailureActive] = useState(false);
  const [injectingFailure, setInjectingFailure] = useState(false);

  // Kafka restart state
  const [restartingKafka, setRestartingKafka] = useState(false);

  // ── Real data: GET /admin/events (OPS_ADMIN only) ──
  const { data: eventsData, isLoading: loadingEvents } = useQuery({
    queryKey: ["admin-all-events"],
    queryFn: async () => {
      const res = await api.get("/admin/events");
      return res.data;
    },
    enabled: isAuthorized,
  });

  const events: any[] = eventsData?.data ?? eventsData ?? [];
  const onSaleCount = events.filter((e) => e.status === "ON_SALE").length;

  // ── Real data: GET /admin/kafka-health (polled every 5s) ──
  const { data: kafkaData, refetch: refetchKafka } = useQuery({
    queryKey: ["admin-kafka-health"],
    queryFn: async () => {
      // 3 second timeout so a disconnected consumer doesn't hang the UI
      const res = await api.get("/admin/kafka-health", { timeout: 3000 });
      return res.data;
    },
    refetchInterval: 5000,
    enabled: isAuthorized,
  });

  // ── Real rate logs from first live event ──
  const firstLiveEvent = events.find((e) => e.status === "ON_SALE");
  const { data: rateLogData } = useQuery({
    queryKey: ["admin-rate-log", firstLiveEvent?.id],
    queryFn: async () => {
      const res = await api.get(`/admin/events/${firstLiveEvent!.id}/rate-log`);
      return res.data;
    },
    enabled: !!firstLiveEvent?.id && isAuthorized,
    refetchInterval: 8000,
  });

  const rateLogs: any[] = Array.isArray(rateLogData) ? rateLogData.slice(-20) : [];

  // ── Build admin log stream from Kafka health + rate logs ──
  const adminLogs: { id: string; ts: string; level: LogLevel; msg: string }[] = [];

  // Kafka health row
  if (kafkaData) {
    const healthy = kafkaData.connected ?? kafkaData.healthy ?? true;
    adminLogs.push({
      id: "kafka",
      ts: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      level: healthy ? "OK" : "CRIT",
      msg: `Kafka consumer: ${
        healthy
          ? "CONNECTED — admission pipeline nominal."
          : "DISCONNECTED — admission pipeline degraded!"
      }`,
    });
  }

  // Rate log rows
  rateLogs.forEach((log, i) => {
    const level: LogLevel = log.throttle_active
      ? "CRIT"
      : log.rate < 10
      ? "WARN"
      : "OK";
    adminLogs.push({
      id: `rate-${log.id ?? i}`,
      ts: new Date(log.created_at ?? Date.now()).toLocaleTimeString("en-GB", {
        hour12: false,
      }),
      level,
      msg: `Event ${firstLiveEvent?.title ?? log.event_id?.slice(0, 8)} | Rate: ${
        log.rate ?? log.admission_rate ?? "—"
      }/min | ${log.throttle_active ? "THROTTLE ACTIVE" : "NOMINAL"}`,
    });
  });

  if (adminLogs.length === 0) {
    adminLogs.push({
      id: "idle",
      ts: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      level: "INFO",
      msg: "OPS DASHBOARD ACTIVE. Waiting for live event data...",
    });
  }

  // ── Failure Injection (OPS_ADMIN — real POST /mock-checkout/inject-failure) ──
  const handleInjectFailure = async (inject: boolean) => {
    if (!failureEventId.trim()) {
      toast.error("Enter an event ID first.");
      return;
    }
    setInjectingFailure(true);
    try {
      await api.post(
        inject
          ? "/mock-checkout/inject-failure"
          : "/mock-checkout/clear-failure",
        { eventId: failureEventId.trim() }
      );
      setFailureActive(inject);
      toast.success(
        inject
          ? "503 payment failure injected for that event."
          : "Failure cleared — gateway restored."
      );
    } catch {
      toast.error("Request failed. Verify OPS_ADMIN auth and event ID.");
    }
    setInjectingFailure(false);
  };

  const handleRestartKafka = async () => {
    setRestartingKafka(true);
    try {
      await api.post("/admin/kafka-restart");
      toast.success("Kafka consumer restart initiated.");
      await refetchKafka();
    } catch {
      toast.error("Failed to restart Kafka consumer.");
    }
    setRestartingKafka(false);
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="font-mono text-xs text-[#9ca3af] animate-pulse uppercase tracking-widest">
          Verifying OPS_ADMIN clearance...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#080810] text-[#dfe3e7] spotlight-bg">
      <div className="px-6 md:px-12 py-12 max-w-7xl mx-auto flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/[0.05] pb-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e11d48] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#e11d48] pulse-dot-red" />
              </span>
              <span className="font-mono text-[10px] text-[#e11d48] uppercase tracking-widest font-bold">
                OPS ADMIN LIVE MONITOR
              </span>
            </div>
            <h1 className="font-[family-name:var(--font-bebas)] text-4xl sm:text-5xl md:text-6xl text-white tracking-wide">
              SYSTEM OVERVIEW
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel px-4 py-2.5 rounded flex items-center gap-4 border border-white/[0.08]"
          >
            <span className="font-mono text-xs text-[#9ca3af] font-bold tracking-wider">
              SESSION:
            </span>
            <span className="font-mono text-base text-[#ffb95f] font-semibold tracking-widest">
              {pad(uptime.h)}:{pad(uptime.m)}:{pad(uptime.s)}
            </span>
          </motion.div>
        </div>

        {/* Kafka Health Panel */}
        {kafkaData && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`glass-panel rounded-xl overflow-hidden border shadow-lg ${
              kafkaData.connected
                ? "border-[#00b87c]/20"
                : "border-[#e11d48]/40 shadow-[0_0_30px_rgba(225,29,72,0.1)]"
            }`}
          >
            <div
              className={`px-6 py-4 border-b flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                kafkaData.connected
                  ? "bg-[#00b87c]/10 border-[#00b87c]/20"
                  : "bg-[#93000a]/10 border-[#e11d48]/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldAlert
                  size={20}
                  className={
                    kafkaData.connected ? "text-[#00b87c]" : "text-[#e11d48]"
                  }
                />
                <span className="font-mono text-xs uppercase tracking-widest font-bold text-white">
                  KAFKA CONSUMER HEALTH
                </span>
              </div>
              <div className="flex items-center gap-4">
                <GlassBadge variant={kafkaData.connected ? "live" : "ended"}>
                  {kafkaData.connected ? "CONNECTED" : "DISCONNECTED"}
                </GlassBadge>
                {!kafkaData.connected && (
                  <button
                    onClick={handleRestartKafka}
                    disabled={restartingKafka}
                    className="px-4 py-1.5 rounded font-mono text-[10px] uppercase tracking-widest transition-all cursor-pointer border bg-[#e11d48]/10 border-[#e11d48] text-[#ffb3b6] hover:bg-[#e11d48]/20 disabled:opacity-50"
                  >
                    {restartingKafka ? "Restarting..." : "Restart Consumer"}
                  </button>
                )}
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#080810]/50">
              <div>
                <p className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-widest mb-1">
                  Group ID
                </p>
                <p className="font-mono text-xs text-white">
                  {kafkaData.groupId || "—"}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-widest mb-1">
                  Topic
                </p>
                <p className="font-mono text-xs text-[#ffb95f]">
                  {kafkaData.topic || "—"}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-widest mb-1">
                  Consumer Lag
                </p>
                <p className="font-mono text-xs text-white">
                  {kafkaData.lag === null ? "NOT AVAILABLE" : kafkaData.lag}
                </p>
                {kafkaData.lagNote && (
                  <p className="font-sans text-xs text-[#9ca3af] mt-1">
                    ℹ️ {kafkaData.lagNote}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* KPI Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-6"
        >
          <OdometerStat value={events.length} label="Total Events" />
          <OdometerStat value={onSaleCount} label="Events Live Now" />
          <div className="glass-panel p-6 rounded-xl flex flex-col items-center justify-center text-center border border-white/[0.05] shadow-lg">
            <span className="font-[family-name:var(--font-bebas)] text-5xl sm:text-6xl leading-none tracking-tight mb-2">
              {kafkaData == null ? (
                <span className="text-[#9ca3af] animate-pulse">…</span>
              ) : (kafkaData.connected ?? kafkaData.healthy ?? true) ? (
                <span className="text-[#00b87c] text-glow">OK</span>
              ) : (
                <span className="text-[#e11d48] text-glow">DOWN</span>
              )}
            </span>
            <span className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-widest">
              Kafka Status
            </span>
          </div>
        </motion.div>

        {/* Log stream + Events table side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Admin Log Stream */}
          <div className="lg:col-span-7">
            <div className="glass-panel rounded-xl overflow-hidden border border-white/[0.05] shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
              <div className="px-6 py-4 border-b border-white/[0.05] bg-[#171c1f]/50 flex items-center justify-between">
                <span className="font-mono text-[10px] text-white uppercase tracking-widest font-bold">
                  SYSTEM LOG STREAM
                </span>
                <span className="font-mono text-[10px] text-[#9ca3af] flex items-center gap-1">
                  <Filter size={11} />
                  KAFKA + RATE LOGS
                </span>
              </div>
              <div className="max-h-[400px] overflow-y-auto hide-scrollbar">
                <table className="w-full text-left border-collapse">
                  <tbody>
                    <AnimatePresence initial={false}>
                      {adminLogs.map((log) => (
                        <AdminLogRow key={log.id} {...log} />
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* All Events mini-table */}
          <div className="lg:col-span-5">
            <div className="glass-panel rounded-xl overflow-hidden border border-white/[0.05] shadow-lg flex flex-col">
              <div className="px-4 py-3 border-b border-white/[0.05] bg-[#171c1f]/50 flex justify-between items-center">
                <span className="font-mono text-[10px] text-white uppercase tracking-widest font-bold">
                  ALL EVENTS
                </span>
                <button
                  onClick={() => router.push("/admin/events")}
                  className="font-mono text-[10px] text-[#e11d48] hover:text-[#ffb3b6] transition-colors flex items-center gap-1 cursor-pointer"
                >
                  Full List <ArrowUpRight size={11} />
                </button>
              </div>
              <div className="max-h-[400px] overflow-y-auto hide-scrollbar">
                {loadingEvents && (
                  <div className="p-8 text-center font-mono text-xs text-[#9ca3af] animate-pulse uppercase tracking-widest">
                    Loading events...
                  </div>
                )}
                {events.slice(0, 8).map((event) => {
                  const bv =
                    event.status === "ON_SALE"
                      ? "live"
                      : event.status === "ENDED"
                      ? "ended"
                      : "upcoming";
                  return (
                    <div
                      key={event.id}
                      onClick={() =>
                        router.push(`/admin/events/${event.id}`)
                      }
                      className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-white truncate group-hover:text-[#ffb3b6] transition-colors">
                          {event.title}
                        </p>
                        <p className="font-mono text-[10px] text-[#9ca3af]">
                          {event.merchant?.name ?? "—"}
                        </p>
                      </div>
                      <GlassBadge variant={bv} className="shrink-0">
                        {event.status}
                      </GlassBadge>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── OPS_ADMIN Failure Injection Panel ── */}
        <div className="glass-panel rounded-xl overflow-hidden border border-[#e11d48]/20 shadow-[0_12px_40px_rgba(225,29,72,0.1)]">
          <div className="px-6 py-4 border-b border-[#e11d48]/10 bg-[#93000a]/10 flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e11d48] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#e11d48] pulse-dot-red" />
            </span>
            <span className="font-mono text-[10px] text-[#e11d48] uppercase tracking-widest font-bold">
              GATEWAY CONTROL — PAYMENT FAILURE INJECTION
            </span>
          </div>
          <div className="p-6 flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="flex flex-col gap-2 flex-grow max-w-sm">
              <label className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-widest">
                Event ID (UUID)
              </label>
              <input
                value={failureEventId}
                onChange={(e) => setFailureEventId(e.target.value)}
                placeholder="Paste event UUID..."
                className="glass-panel px-4 py-2.5 rounded text-[#dfe3e7] font-mono text-xs w-full focus:outline-none focus:border-[#e11d48]/40 placeholder:text-[#9ca3af]/50"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleInjectFailure(true)}
                disabled={injectingFailure}
                className={`px-5 py-2.5 rounded font-mono text-[10px] uppercase tracking-widest transition-all cursor-pointer border ${
                  failureActive
                    ? "bg-[#e11d48]/10 border-[#e11d48] text-[#ffb3b6]"
                    : "bg-[#93000a]/10 border-[#93000a] text-[#ffb4ab] hover:bg-[#93000a]/20"
                }`}
              >
                {failureActive ? "⚡ ACTIVE" : "Inject 503"}
              </button>
              <button
                onClick={() => handleInjectFailure(false)}
                disabled={injectingFailure}
                className={`px-5 py-2.5 rounded font-mono text-[10px] uppercase tracking-widest transition-all cursor-pointer border ${
                  !failureActive
                    ? "bg-[#00b87c]/10 border-[#00b87c] text-[#00b87c]"
                    : "border-white/[0.08] text-[#9ca3af] hover:bg-white/[0.05]"
                }`}
              >
                Clear Failure
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
