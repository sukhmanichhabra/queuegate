"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, animate } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { useMerchantStats } from "@/hooks/useMerchantStats";
import { GlassBadge } from "@/components/glass/GlassBadge";
import { Users, Filter, ArrowDown } from "lucide-react";

/* ── Animated odometer counter ── */
function OdometerCounter({
  value,
  label,
  suffix = "",
}: {
  value: number;
  label: string;
  suffix?: string;
}) {
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
    <div className="glass-panel rounded-xl p-8 flex-grow flex flex-col items-center justify-center relative overflow-hidden border-t-2 border-t-[#ffb3b6] shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <Users size={16} className="text-[#ffb3b6]" />
        <span className="font-mono text-[10px] text-[#ffb3b6] uppercase tracking-widest font-semibold">
          {label}
        </span>
      </div>
      <div className="mt-8 mb-4">
        <div className="font-[family-name:var(--font-bebas)] text-6xl sm:text-[80px] text-white leading-none tracking-tight flex items-baseline justify-center select-none text-glow">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={value}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ type: "spring", stiffness: 350, damping: 22 }}
              className="inline-block"
            >
              <span ref={ref}>0</span>
            </motion.span>
          </AnimatePresence>
          {suffix && (
            <span className="text-[#e11d48] ml-1 font-bold">{suffix}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Log level badge ── */
type LogLevel = "CRIT" | "WARN" | "INFO" | "OK";

function levelClass(level: LogLevel) {
  switch (level) {
    case "CRIT":
      return {
        row: "border-b border-white/[0.05] bg-[#93000a]/10 hover:bg-[#93000a]/20 transition-colors",
        badge: "bg-[#93000a]/20 text-[#ffb4ab] border border-[#e11d48]/20",
      };
    case "WARN":
      return {
        row: "border-b border-white/[0.05] bg-[#ee9800]/5 hover:bg-[#ee9800]/15 transition-colors",
        badge: "bg-[#ee9800]/10 text-[#ffb95f] border border-[#ffb95f]/20",
      };
    case "OK":
      return {
        row: "border-b border-white/[0.05] bg-[#00b87c]/5 hover:bg-[#00b87c]/15 transition-colors",
        badge: "bg-[#00b87c]/15 text-[#00b87c] border border-[#00b87c]/30",
      };
    default:
      return {
        row: "border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors",
        badge: "bg-[#262b2e]/50 text-[#dfe3e7] border border-white/[0.08]",
      };
  }
}

/* ── Use first live event for WS stats ── */
function useLiveStats(liveEventId: string | null) {
  const { stats, rateHistory } = useMerchantStats(liveEventId ?? "");
  return { stats, rateHistory };
}

export default function MerchantDashboardPage() {
  const router = useRouter();
  const { isAuthorized } = useRoleGuard("MERCHANT_ADMIN");

  // Uptime stopwatch (client-side session timer)
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

  // ── Real data: GET /merchants/events (CONFIRMED Phase 23) ──
  const {
    data: events,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["merchant-events"],
    queryFn: async () => {
      const res = await api.get("/merchants/events");
      return res.data as any[];
    },
  });

  const liveEvents = events?.filter((e: any) => e.status === "ON_SALE") ?? [];
  const firstLiveEventId = liveEvents[0]?.id ?? null;

  // ── Real per-event stats (polling, CONFIRMED Phase 23) ──
  const { data: statsData } = useQuery({
    queryKey: ["merchant-stats", liveEvents.map((e: any) => e.id).join(",")],
    queryFn: async () => {
      if (liveEvents.length === 0) return { totalQueueDepth: 0, admittedToday: 0 };
      const results = await Promise.allSettled(
        liveEvents.map((e: any) =>
          api.get(`/merchants/events/${e.id}/stats`)
        )
      );
      let totalQueueDepth = 0;
      let admittedToday = 0;
      results.forEach((r) => {
        if (r.status === "fulfilled") {
          totalQueueDepth += r.value.data.queueDepth || 0;
          admittedToday += r.value.data.admittedToday || 0;
        }
      });
      return { totalQueueDepth, admittedToday };
    },
    enabled: (events?.length ?? 0) > 0,
    refetchInterval: 5000,
  });

  // ── Real WS live stats for first live event ──
  const { stats: wsStats, rateHistory } = useLiveStats(firstLiveEventId);

  const totalQueueDepth = wsStats.queueDepth || statsData?.totalQueueDepth || 0;
  const admittedToday = statsData?.admittedToday ?? 0;
  const admissionRate = wsStats.admissionRate || 0;

  // ── Build log entries from real data ──
  const logs = (() => {
    const entries: { id: string; ts: string; level: LogLevel; msg: string }[] = [];
    if (wsStats.throttleActive) {
      entries.push({
        id: "throttle",
        ts: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        level: "CRIT",
        msg: "Auto-throttle compressor ACTIVE. Payment processor health degraded.",
      });
    }
    if (admissionRate > 0) {
      entries.push({
        id: "rate",
        ts: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        level: wsStats.throttleActive ? "WARN" : "OK",
        msg: `Live admission rate: ${admissionRate}/min across ${liveEvents.length} active event(s).`,
      });
    }
    if (totalQueueDepth > 0) {
      entries.push({
        id: "queue",
        ts: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        level: "INFO",
        msg: `Total queue depth: ${totalQueueDepth.toLocaleString()} fans waiting.`,
      });
    }
    if (entries.length === 0) {
      entries.push({
        id: "idle",
        ts: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        level: "INFO",
        msg: "System nominal. No active events with live queues.",
      });
    }
    return entries;
  })();

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleGoLive = async (id: string) => {
    try {
      await api.post(`/merchants/events/${id}/resume`);
      refetch();
    } catch {
      /* swallow */
    }
  };

  const handlePause = async (id: string) => {
    try {
      await api.post(`/merchants/events/${id}/pause`);
      refetch();
    } catch {
      /* swallow */
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="font-mono text-xs text-[#9ca3af] animate-pulse uppercase tracking-widest">
          Verifying access...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#080810] text-[#dfe3e7] spotlight-bg">
      <div className="px-6 md:px-12 py-12 max-w-7xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/[0.05] pb-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="font-[family-name:var(--font-bebas)] text-4xl sm:text-5xl md:text-6xl text-white tracking-wide">
              MERCHANT DASHBOARD
            </h1>
            <p className="font-mono text-xs text-[#9ca3af] mt-2 uppercase tracking-widest">
              {liveEvents.length} LIVE EVENT(S) •{" "}
              {events?.length ?? 0} TOTAL
            </p>
          </motion.div>

          <div className="flex items-center gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="glass-panel px-4 py-2.5 rounded flex items-center gap-4 border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
            >
              <span className="font-mono text-xs text-[#9ca3af] font-bold tracking-wider">
                SESSION UPTIME:
              </span>
              <span className="font-mono text-base text-[#ffb95f] font-semibold tracking-widest">
                {pad(uptime.h)}:{pad(uptime.m)}:{pad(uptime.s)}
              </span>
            </motion.div>

            <button
              onClick={() => router.push("/merchant/events/new")}
              className="bg-[#e11d48] text-white px-6 py-2.5 rounded font-mono text-xs uppercase tracking-widest hover:bg-[#be0037] transition-all glow-button cursor-pointer"
            >
              + New Event
            </button>
          </div>
        </div>

        {/* Throttle warning banner */}
        {wsStats.throttleActive && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#ee9800]/10 border border-[#ee9800]/20 rounded p-4 flex items-start gap-4"
          >
            <span className="text-[#ffb95f] mt-0.5 text-lg">⚠️</span>
            <div>
              <h3 className="font-mono text-xs text-[#ffb95f] mb-1 font-bold uppercase tracking-wider">
                AUTO-THROTTLE COMPRESSOR ACTIVE
              </h3>
              <p className="font-sans text-xs text-[#9ca3af]/90 leading-relaxed">
                Payment processor health degraded. Admission rate reduced
                automatically to prevent transaction timeouts.
              </p>
            </div>
          </motion.div>
        )}

        {/* KPI + Logs grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Odometer cards */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <OdometerCounter
              value={totalQueueDepth}
              label="Fans in queue right now"
            />

            {/* Admitted today card */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="glass-panel rounded-xl p-6 flex justify-between items-center shadow-lg border border-white/[0.05]"
            >
              <div>
                <h4 className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-widest font-semibold mb-1">
                  ADMITTED TODAY
                </h4>
                <p className="font-mono text-xl text-white font-bold">
                  {admittedToday.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <h4 className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-widest font-semibold mb-1">
                  ADMISSION RATE
                </h4>
                <p className="font-mono text-sm text-[#e11d48] font-bold flex items-center gap-1 justify-end">
                  ~{admissionRate}/min{" "}
                  {wsStats.throttleActive && (
                    <ArrowDown size={12} className="animate-bounce" />
                  )}
                </p>
              </div>
            </motion.div>
          </div>

          {/* Right: Chart + Logs */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* SVG line chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel rounded-xl p-6 h-64 relative flex flex-col shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-white/[0.05]"
            >
              <div className="flex justify-between items-center mb-4">
                <span className="font-mono text-[10px] text-white uppercase tracking-widest font-bold">
                  LIVE ADMISSION THROUGHPUT
                </span>
                <div className="flex items-center gap-2 px-2 py-1 bg-[#e11d48]/10 border border-[#e11d48]/30 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e11d48] animate-pulse" />
                  <span className="font-mono text-[10px] text-[#e11d48] font-bold">
                    LIVE
                  </span>
                </div>
              </div>
              <div className="flex-grow relative border-b border-l border-white/[0.08] ml-8 mb-6 mt-2">
                <div className="absolute -left-9 top-0 bottom-0 flex flex-col justify-between text-[9px] font-mono text-[#9ca3af]/80 py-1 font-semibold">
                  <span>400</span>
                  <span>300</span>
                  <span>200</span>
                  <span>0</span>
                </div>
                <svg
                  className="absolute inset-0 w-full h-full"
                  preserveAspectRatio="none"
                  viewBox="0 0 100 100"
                >
                  <defs>
                    <linearGradient
                      id="chartGlow"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#e11d48"
                        stopOpacity="0.25"
                      />
                      <stop
                        offset="100%"
                        stopColor="#e11d48"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>
                  {rateHistory.length > 1 ? (
                    (() => {
                      const maxRate = Math.max(
                        ...rateHistory.map((p) => p.rate),
                        1
                      );
                      const points = rateHistory.slice(-20).map((p, i, arr) => ({
                        x: (i / (arr.length - 1)) * 100,
                        y: 100 - (p.rate / maxRate) * 90,
                      }));
                      const d = points
                        .map((p, i) =>
                          i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
                        )
                        .join(" ");
                      const fill = `${d} L 100 100 L 0 100 Z`;
                      return (
                        <>
                          <motion.path
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            d={fill}
                            fill="url(#chartGlow)"
                          />
                          <motion.path
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.8 }}
                            d={d}
                            fill="none"
                            stroke="#e11d48"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.5"
                          />
                          <circle
                            cx={points[points.length - 1].x}
                            cy={points[points.length - 1].y}
                            r="3.5"
                            fill="#e11d48"
                            className="pulse-live"
                          />
                        </>
                      );
                    })()
                  ) : (
                    /* Placeholder curve while no WS data */
                    <>
                      <motion.path
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1.2, delay: 0.2 }}
                        d="M 0 70 L 10 65 L 20 50 L 30 45 L 40 60 L 50 55 L 60 50 L 70 65 L 80 70 L 90 65 L 100 70 L 100 100 L 0 100 Z"
                        fill="url(#chartGlow)"
                      />
                      <motion.path
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                        fill="none"
                        d="M 0 70 L 10 65 L 20 50 L 30 45 L 40 60 L 50 55 L 60 50 L 70 65 L 80 70 L 90 65 L 100 70"
                        stroke="#e11d48"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                      />
                      <circle
                        cx="100"
                        cy="70"
                        r="3.5"
                        fill="#e11d48"
                        className="pulse-live"
                      />
                    </>
                  )}
                </svg>
                <div className="absolute -bottom-5 left-0 right-0 flex justify-between text-[9px] font-mono text-[#9ca3af]/80 px-1">
                  <span>−5m</span>
                  <span>−4m</span>
                  <span>−3m</span>
                  <span>−2m</span>
                  <span>−1m</span>
                  <span className="text-[#e11d48]">NOW</span>
                </div>
              </div>
            </motion.div>

            {/* System log console (real data) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-panel rounded-xl overflow-hidden flex-grow flex flex-col shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-white/[0.05]"
            >
              <div className="px-6 py-4 border-b border-white/[0.05] bg-[#171c1f]/50 flex justify-between items-center">
                <span className="font-mono text-[10px] text-white uppercase tracking-widest font-bold">
                  ADMISSION LOG STREAM
                </span>
                <span className="font-mono text-[11px] text-[#9ca3af] flex items-center gap-1">
                  <Filter size={11} /> REAL DATA
                </span>
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                <table className="w-full text-left border-collapse font-mono text-xs">
                  <tbody>
                    <AnimatePresence initial={false}>
                      {logs.map((log) => {
                        const cls = levelClass(log.level);
                        return (
                          <motion.tr
                            key={log.id}
                            initial={{ opacity: 0, height: 0, y: -10 }}
                            animate={{ opacity: 1, height: "auto", y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.35 }}
                            className={cls.row}
                          >
                            <td className="px-4 py-3 w-20 text-[#9ca3af] font-bold">
                              {log.ts}
                            </td>
                            <td className="px-2 py-3 w-16">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${cls.badge}`}
                              >
                                {log.level}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-white/90">
                              {log.msg}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        </div>

        {/* ── Events Table ── */}
        <div className="glass-panel rounded-xl overflow-hidden border border-white/[0.05]">
          <div className="px-6 py-4 border-b border-white/[0.05] bg-[#171c1f]/50">
            <h2 className="font-mono text-xs text-white uppercase tracking-widest font-bold">
              MY EVENTS
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  {["Event", "Status", "Capacity", "Rate /min", "Starts At", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-6 py-4 text-[#9ca3af] font-semibold uppercase tracking-wider text-[10px]"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-white/[0.05]">
                      {[...Array(6)].map((__, j) => (
                        <td key={j} className="px-6 py-4">
                          <div
                            className="h-3 rounded bg-white/[0.04] animate-pulse"
                            style={{ width: j === 0 ? "80%" : j === 5 ? "120px" : "60%" }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}

                {isError && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-[#9ca3af]"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <span>Failed to load events.</span>
                        <button
                          onClick={() => refetch()}
                          className="text-[#e11d48] hover:text-[#ffb3b6] transition-colors cursor-pointer"
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {events?.map((event: any) => {
                  const bv =
                    event.status === "ON_SALE"
                      ? "live"
                      : event.status === "ENDED"
                      ? "ended"
                      : "upcoming";
                  return (
                    <tr
                      key={event.id}
                      className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-white">
                        {event.title}
                      </td>
                      <td className="px-6 py-4">
                        <GlassBadge variant={bv}>{event.status}</GlassBadge>
                      </td>
                      <td className="px-6 py-4 tabular-nums text-[#dfe3e7]">
                        {event.capacity?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 tabular-nums text-[#dfe3e7]">
                        {event.admission_rate_per_min}
                      </td>
                      <td className="px-6 py-4 text-[#9ca3af]">
                        {formatDate(event.show_date)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          {(event.status === "DRAFT" ||
                            event.status === "PAUSED") && (
                            <button
                              onClick={() => handleGoLive(event.id)}
                              className="bg-[#00b87c]/20 text-[#00b87c] border border-[#00b87c]/30 hover:bg-[#00b87c]/30 px-3 py-1 rounded text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Go Live
                            </button>
                          )}
                          {event.status === "ON_SALE" && (
                            <>
                              <button
                                onClick={() => handlePause(event.id)}
                                className="bg-[#ffb95f]/20 text-[#ffb95f] border border-[#ffb95f]/30 hover:bg-[#ffb95f]/30 px-3 py-1 rounded text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Pause
                              </button>
                              <button
                                onClick={() =>
                                  router.push(
                                    `/merchant/events/${event.id}/live`
                                  )
                                }
                                className="bg-[#e11d48]/20 text-[#ffb3b6] border border-[#e11d48]/30 hover:bg-[#e11d48]/30 px-3 py-1 rounded text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                              >
                                View Live
                              </button>
                            </>
                          )}
                          <button
                            onClick={() =>
                              router.push(`/merchant/events/${event.id}/edit`)
                            }
                            className="glass-panel text-[#9ca3af] border border-white/[0.08] hover:bg-white/[0.05] px-3 py-1 rounded text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!isLoading && events?.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-16 text-center text-[#9ca3af]"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <span className="text-4xl">🎪</span>
                        <p className="uppercase tracking-widest">
                          No events yet. Create your first event to open your
                          queue.
                        </p>
                        <button
                          onClick={() => router.push("/merchant/events/new")}
                          className="bg-[#e11d48] text-white px-8 py-3 rounded font-mono text-xs uppercase tracking-widest hover:bg-[#be0037] transition-all glow-button cursor-pointer"
                        >
                          + New Event
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
