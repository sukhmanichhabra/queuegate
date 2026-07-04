"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, animate } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassBadge } from "@/components/glass/GlassBadge";
import { Button } from "@/components/ui/button";
import { useMerchantStats } from "@/hooks/useMerchantStats";
import { toast } from "sonner";
import {
  Download,
  UserPlus,
  Loader2,
  X,
  Plus,
  CheckCircle2,
  AlertCircle,
  Ticket,
  Users,
  TrendingUp,
  DollarSign,
  Activity,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

/* ── Animated number counter ── */
function AnimatedNumber({
  value,
  className,
  prefix = "",
  decimals = 0,
}: {
  value: number;
  className?: string;
  prefix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const current = parseFloat(node.dataset.value || "0");
    const controls = animate(current, value, {
      duration: 0.7,
      ease: "easeOut",
      onUpdate(v) {
        node.textContent = prefix + v.toFixed(decimals);
        node.dataset.value = v.toFixed(decimals);
      },
    });
    return () => controls.stop();
  }, [value, prefix, decimals]);
  return (
    <span ref={ref} data-value="0" className={className}>
      {prefix}0
    </span>
  );
}

/* ── Stat card ── */
function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  color,
  prefix = "",
  decimals = 0,
  delay = 0,
}: {
  label: string;
  value: number;
  subValue?: string;
  icon: React.ElementType;
  color: string;
  prefix?: string;
  decimals?: number;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <GlassCard className="p-5 flex flex-col gap-3 relative overflow-hidden">
        {/* Ambient glow */}
        <div
          className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-20"
          style={{ background: color }}
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-[0.18em]">
            {label}
          </span>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${color}20`, border: `1px solid ${color}40` }}
          >
            <Icon size={13} style={{ color }} />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <AnimatedNumber
            value={value}
            prefix={prefix}
            decimals={decimals}
            className="font-[family-name:var(--font-bebas)] text-4xl text-white leading-none tracking-wide"
          />
        </div>
        {subValue && (
          <span className="font-mono text-[10px] text-[#6b7280]">{subValue}</span>
        )}
      </GlassCard>
    </motion.div>
  );
}

/* ── Capacity progress bar ── */
function CapacityBar({
  totalProcessed,
  capacity,
}: {
  totalProcessed: number;
  capacity: number;
}) {
  const pct = capacity > 0 ? Math.min((totalProcessed / capacity) * 100, 100) : 0;
  const color = pct >= 90 ? "#e11d48" : pct >= 70 ? "#f59e0b" : "#8b5cf6";

  return (
    <GlassCard className="p-5">
      <div className="flex justify-between items-center mb-3">
        <span className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-[0.18em]">
          Capacity Utilization
        </span>
        <span className="font-mono text-xs font-bold" style={{ color }}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden mb-2">
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1] }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}99, ${color})` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-[#6b7280]">
        <span>{totalProcessed.toLocaleString()} processed</span>
        <span>{capacity.toLocaleString()} capacity</span>
      </div>
    </GlassCard>
  );
}

/* ── VIP Whitelist Panel ── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function VipWhitelistPanel({ eventId }: { eventId: string }) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ count: number } | null>(null);

  const addEmail = () => {
    const trimmed = draft.trim().toLowerCase();
    if (!trimmed) return;
    if (!EMAIL_RE.test(trimmed)) { setDraftError("Invalid email address"); return; }
    if (emails.includes(trimmed)) { setDraftError("Already in the list"); return; }
    setEmails((prev) => [...prev, trimmed]);
    setDraft("");
    setDraftError(null);
    setResult(null);
  };

  const removeEmail = (email: string) =>
    setEmails((prev) => prev.filter((e) => e !== email));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addEmail(); }
  };

  const handleSubmit = async () => {
    if (emails.length === 0) { toast.error("Add at least one email."); return; }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await api.post(`/merchants/events/${eventId}/vip-whitelist`, emails);
      setResult({ count: res.data.count });
      setEmails([]);
      toast.success(`${res.data.count} VIP${res.data.count === 1 ? "" : "s"} added successfully.`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add VIPs.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 flex items-center justify-center shrink-0 mt-0.5">
          <UserPlus size={16} className="text-[#8b5cf6]" />
        </div>
        <div>
          <h3 className="font-[family-name:var(--font-bebas)] text-xl tracking-wide text-white">
            VIP Whitelist
          </h3>
          <p className="font-mono text-[10px] text-[#9ca3af] mt-0.5 leading-relaxed">
            VIP entries are inserted at{" "}
            <span className="text-[#8b5cf6]">score = 0</span> in the Redis
            queue, bypassing all general-admission positions.
          </p>
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <input
            type="email"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setDraftError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="vip@artist.com"
            className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:ring-1 focus:ring-[#8b5cf6] focus:border-[#8b5cf6] transition-all font-mono"
          />
          {draftError && (
            <p className="font-mono text-[10px] text-[#e11d48] mt-1 flex items-center gap-1">
              <AlertCircle size={10} /> {draftError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={addEmail}
          className="px-3 py-2.5 rounded-lg bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 text-[#8b5cf6] hover:bg-[#8b5cf6]/25 transition-all cursor-pointer shrink-0"
        >
          <Plus size={16} />
        </button>
      </div>
      {emails.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {emails.map((email) => (
            <motion.div
              key={email}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#8b5cf6]/10 border border-[#8b5cf6]/25 font-mono text-[11px] text-[#c4b5fd]"
            >
              {email}
              <button type="button" onClick={() => removeEmail(email)} className="text-[#9ca3af] hover:text-[#e11d48] transition-colors cursor-pointer">
                <X size={10} />
              </button>
            </motion.div>
          ))}
        </div>
      )}
      {result && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-[#10b981]/10 border border-[#10b981]/25">
          <CheckCircle2 size={14} className="text-[#10b981] shrink-0" />
          <p className="font-mono text-[11px] text-[#6ee7b7]">
            {result.count} VIP{result.count === 1 ? "" : "s"} added and placed at the front of the queue.
          </p>
        </motion.div>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || emails.length === 0}
        className="w-full py-2.5 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono text-xs uppercase tracking-widest font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        {submitting ? (
          <><Loader2 size={14} className="animate-spin" />Adding VIPs...</>
        ) : (
          <><UserPlus size={14} />Add {emails.length > 0 ? `${emails.length} VIP${emails.length === 1 ? "" : "s"}` : "VIPs"}</>
        )}
      </button>
    </GlassCard>
  );
}

/* ── Export button ── */
function ExportRateLogButton({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false);
  const handleExport = async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/merchants/events/${eventId}/rate-log/export`,
        { method: "GET", headers: { Authorization: token ? `Bearer ${token}` : "" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rate_log_${eventId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Rate log downloaded.");
    } catch {
      toast.error("Failed to export rate log.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-[#facc15]/10 hover:border-[#facc15]/30 hover:text-[#facc15] text-[#9ca3af] font-mono text-[10px] uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
    >
      {loading ? <Loader2 size={13} className="animate-spin text-[#facc15]" /> : <Download size={13} />}
      {loading ? "Exporting..." : "Export Rate Log"}
    </button>
  );
}

/* ── Main Page ── */
export default function LiveDashboardPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const eventId = params.id;
  const { stats, rateHistory, hasLiveStats } = useMerchantStats(eventId);
  const [pausing, setPausing] = useState(false);

  const { data: event, refetch: refetchEvent } = useQuery({
    queryKey: ["merchant-event-live", eventId],
    queryFn: async () => {
      const res = await api.get(`/merchants/events/${eventId}`);
      return res.data;
    },
  });

  const { data: initialStats } = useQuery({
    queryKey: ["merchant-event-stats", eventId],
    queryFn: async () => {
      const res = await api.get(`/merchants/events/${eventId}/stats`);
      return res.data;
    },
    staleTime: 0,
  });

  // Merge: prefer live WS stats, fall back to REST snapshot for each field
  const queueDepth = (hasLiveStats ? stats.queueDepth : initialStats?.queueDepth) ?? 0;
  const admissionRate = (hasLiveStats ? stats.admissionRate : initialStats?.admissionRatePerMin) ?? 0;
  const ticketsSold = (hasLiveStats ? stats.ticketsSold : initialStats?.ticketsSold) ?? 0;
  const admittedNow = (hasLiveStats ? stats.admittedNow : initialStats?.admittedNow) ?? 0;
  const totalProcessed = (hasLiveStats ? stats.totalProcessed : initialStats?.totalProcessed) ?? 0;
  const revenue = (hasLiveStats ? stats.revenue : initialStats?.revenue) ?? 0;
  const capacity = (hasLiveStats ? stats.capacity : (initialStats?.capacity ?? event?.capacity)) ?? 0;
  const ticketPrice = initialStats?.ticketPrice ?? event?.ticket_price ?? 0;
  const throttleActive = (hasLiveStats ? stats.throttleActive : initialStats?.throttleActive) ?? false;

  const handlePause = async () => {
    setPausing(true);
    try {
      await api.post(`/merchants/events/${eventId}/pause`);
      toast.success("Event paused.");
      refetchEvent();
    } catch { toast.error("Failed to pause."); }
    setPausing(false);
  };

  const handleResume = async () => {
    setPausing(true);
    try {
      await api.post(`/merchants/events/${eventId}/resume`);
      toast.success("Event resumed.");
      refetchEvent();
    } catch { toast.error("Failed to resume."); }
    setPausing(false);
  };

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="container mx-auto px-4 py-16 max-w-7xl">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="text-3xl font-extrabold">
              {event?.title || "Live Dashboard"}
            </motion.h1>
            <p className="text-[var(--text-muted)] mt-1 font-mono text-xs">
              {event?.artist && <span className="text-[#facc15]">{event.artist}</span>}
              {event?.venue && <span> · {event.venue}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <GlassBadge variant={event?.status === "ON_SALE" ? "live" : "upcoming"}>
              {event?.status || "LOADING"}
            </GlassBadge>
            <ExportRateLogButton eventId={eventId} />
          </div>
        </div>

        {/* ── Throttle Warning ── */}
        <AnimatePresence>
          {throttleActive && (
            <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
              className="glass-card mb-8 p-4 border-yellow-500/30 bg-yellow-500/10 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-bold text-yellow-400">Auto-throttle active</p>
                <p className="text-sm text-yellow-300/80">Downstream health degraded — admission rate has been automatically halved.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Key Metrics Row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Tickets Sold"
            value={ticketsSold}
            subValue="Completed checkouts"
            icon={Ticket}
            color="#10b981"
            delay={0}
          />
          <StatCard
            label="In Checkout"
            value={admittedNow}
            subValue="Admitted, awaiting payment"
            icon={Users}
            color="#8b5cf6"
            delay={0.05}
          />
          <StatCard
            label="Revenue"
            value={revenue}
            subValue={`@ $${ticketPrice} / ticket`}
            icon={DollarSign}
            color="#facc15"
            prefix="$"
            decimals={0}
            delay={0.1}
          />
          <StatCard
            label="Queue Depth"
            value={queueDepth}
            subValue="Actively waiting"
            icon={Activity}
            color="#e11d48"
            delay={0.15}
          />
        </div>

        {/* ── Capacity bar ── */}
        <div className="mb-6">
          <CapacityBar totalProcessed={totalProcessed} capacity={capacity} />
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Admission Rate Chart */}
          <GlassCard className="p-6 min-h-[280px]">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[var(--text-muted)] uppercase tracking-widest text-xs flex items-center gap-2">
                <TrendingUp size={12} />
                Admission Rate — Last 5 Minutes
              </p>
              <GlassBadge variant="upcoming" className="text-[9px]">
                {admissionRate} / min
              </GlassBadge>
            </div>
            {rateHistory.length > 1 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={rateHistory}>
                  <defs>
                    <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} domain={[0, "auto"]} />
                  <Tooltip contentStyle={{ backgroundColor: "rgba(10,10,15,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} />
                  <Area type="monotone" dataKey="rate" stroke="#8b5cf6" strokeWidth={2} fill="url(#rateGrad)" dot={false} isAnimationActive animationDuration={300} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-52 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
                <BarChart3 size={28} className="opacity-30" />
                <span className="font-mono text-xs">Waiting for live data...</span>
              </div>
            )}
          </GlassCard>

          {/* Sales over time — derived from ticketsSold history */}
          <GlassCard className="p-6 min-h-[280px]">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[var(--text-muted)] uppercase tracking-widest text-xs flex items-center gap-2">
                <Ticket size={12} />
                Tickets Sold — Running Total
              </p>
              <span className="font-mono text-[10px] text-[#10b981]">
                {ticketsSold} / {capacity}
              </span>
            </div>
            {rateHistory.length > 1 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={rateHistory.map((p, i) => ({ ...p, sold: Math.round((ticketsSold / rateHistory.length) * (i + 1)) }))}>
                  <defs>
                    <linearGradient id="soldGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} domain={[0, "auto"]} />
                  <Tooltip contentStyle={{ backgroundColor: "rgba(10,10,15,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} />
                  <Area type="monotone" dataKey="sold" stroke="#10b981" strokeWidth={2} fill="url(#soldGrad)" dot={false} isAnimationActive animationDuration={300} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-52 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
                <Ticket size={28} className="opacity-30" />
                <span className="font-mono text-xs">Waiting for live data...</span>
              </div>
            )}
          </GlassCard>
        </div>

        {/* ── VIP + Rate Log ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <VipWhitelistPanel eventId={eventId} />

          {/* Rate Log Table */}
          <GlassCard className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--glass-border)] flex items-center justify-between">
              <h3 className="font-bold text-sm">Admission Rate Log</h3>
              <span className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-wider">Recent changes</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--glass-border)]">
                    <th className="px-6 py-3 text-[var(--text-muted)] font-medium">Time</th>
                    <th className="px-6 py-3 text-[var(--text-muted)] font-medium">Rate</th>
                    <th className="px-6 py-3 text-[var(--text-muted)] font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-[var(--text-muted)]">
                      No rate changes recorded yet.{" "}
                      <span className="text-[#9ca3af] font-mono text-xs">Use Export to download the full log.</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>

        {/* ── Pause / Resume Controls ── */}
        <div className="flex gap-4">
          <Button
            onClick={handlePause}
            disabled={pausing || event?.status === "PAUSED"}
            className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 rounded-xl px-8 py-5 text-lg flex-1"
          >
            {pausing ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            Pause Queue
          </Button>
          <Button
            onClick={handleResume}
            disabled={pausing || event?.status === "ON_SALE"}
            className="bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 rounded-xl px-8 py-5 text-lg flex-1"
          >
            {pausing ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            Resume Queue
          </Button>
        </div>
      </div>
    </main>
  );
}
