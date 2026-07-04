"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { GlassBadge } from "@/components/glass/GlassBadge";
import { cn } from "@/lib/utils";
import {
  Plus,
  BarChart3,
  Play,
  Pause,
  Eye,
  Edit3,
  Calendar,
  Users,
  Ticket,
  DollarSign,
  MapPin,
  Zap,
  Search,
  ChevronRight,
  LayoutGrid,
  List,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

/* ── helpers ── */
const STATUS_VARIANTS: Record<string, "live" | "upcoming" | "ended"> = {
  ON_SALE: "live",
  PAUSED: "upcoming",
  DRAFT: "upcoming",
  SOLD_OUT: "ended",
  ENDED: "ended",
};

const STATUS_LABEL: Record<string, string> = {
  ON_SALE: "Live",
  PAUSED: "Paused",
  DRAFT: "Draft",
  SOLD_OUT: "Sold Out",
  ENDED: "Ended",
};

const ACCENT_BY_STATUS: Record<string, string> = {
  ON_SALE: "#e11d48",
  PAUSED: "#facc15",
  DRAFT: "#9ca3af",
  SOLD_OUT: "#8b5cf6",
  ENDED: "#6b7280",
};

const CARD_GRADIENTS = [
  "from-[#e11d48]/20 via-[#1b0a10]/80",
  "from-[#facc15]/15 via-[#1a1600]/80",
  "from-[#8b5cf6]/20 via-[#0f0818]/80",
  "from-[#06b6d4]/15 via-[#003540]/80",
  "from-[#f97316]/15 via-[#431407]/80",
  "from-[#10b981]/15 via-[#022c22]/80",
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPrice(p: number) {
  return p === 0
    ? "Free"
    : `$${p.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

/* ── Skeleton card ── */
function SkeletonCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden animate-pulse"
      style={{
        height: 300,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    />
  );
}

/* ── Event grid card ── */
function EventCard({
  event,
  index,
  onGoLive,
  onPause,
  onViewLive,
  onEdit,
}: {
  event: any;
  index: number;
  onGoLive: (id: string) => void;
  onPause: (id: string) => void;
  onViewLive: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const router = useRouter();
  const grad = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  const accent = ACCENT_BY_STATUS[event.status] ?? "#9ca3af";
  const bv = STATUS_VARIANTS[event.status] ?? "ended";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      whileHover={{ y: -6, boxShadow: `0 20px 48px rgba(0,0,0,0.7), 0 0 0 1px ${accent}33` }}
      className="relative rounded-2xl overflow-hidden group cursor-default flex flex-col"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Hero / image area */}
      <div className="relative h-44 overflow-hidden">
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover opacity-55 group-hover:opacity-70 group-hover:scale-105 transition-all duration-700"
          />
        ) : (
          <div
            className={`absolute inset-0 bg-gradient-to-b ${grad} to-[#07070f]/95`}
          />
        )}
        {/* dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c14] via-transparent to-transparent" />

        {/* Status badge */}
        <div className="absolute top-3 right-3 z-10">
          <GlassBadge variant={bv}>{STATUS_LABEL[event.status] ?? event.status}</GlassBadge>
        </div>

        {/* Ticket price badge */}
        <div
          className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider"
          style={{
            background: `${accent}22`,
            border: `1px solid ${accent}44`,
            color: accent,
          }}
        >
          <Ticket size={10} />
          {formatPrice(event.ticket_price)}
        </div>

        {/* Big decorative initial */}
        <span
          className="absolute inset-0 flex items-center justify-center font-[family-name:var(--font-bebas)] select-none pointer-events-none"
          style={{ fontSize: 120, color: accent, opacity: 0.07, lineHeight: 1 }}
        >
          {event.title?.charAt(0) ?? "?"}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-grow px-5 py-4 gap-3">
        {/* Title + artist */}
        <div>
          <h3
            className="font-[family-name:var(--font-bebas)] text-3xl text-white leading-none tracking-wide group-hover:text-[#ffb3b6] transition-colors"
          >
            {event.title}
          </h3>
          {event.artist && event.artist !== event.title && (
            <p className="font-mono text-xs uppercase tracking-[0.14em] font-semibold mt-0.5" style={{ color: accent }}>
              {event.artist}
            </p>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {event.venue && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-[#9ca3af]">
              <MapPin size={9} style={{ color: accent }} />
              {event.venue}
            </span>
          )}
          {event.show_date && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-[#9ca3af]">
              <Calendar size={9} style={{ color: accent }} />
              {formatDate(event.show_date)}
            </span>
          )}
          <span className="flex items-center gap-1 font-mono text-[10px] text-[#9ca3af]">
            <Users size={9} style={{ color: accent }} />
            {event.capacity?.toLocaleString()} cap
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-[#9ca3af]">
            <Zap size={9} style={{ color: accent }} />
            {event.admission_rate_per_min}/min
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-auto">
          {(event.status === "DRAFT" || event.status === "PAUSED") && (
            <button
              onClick={() => onGoLive(event.id)}
              className="flex items-center gap-1.5 bg-[#00b87c]/15 text-[#00b87c] border border-[#00b87c]/30 hover:bg-[#00b87c]/25 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
            >
              <Play size={10} />
              Go Live
            </button>
          )}
          {event.status === "ON_SALE" && (
            <>
              <button
                onClick={() => onViewLive(event.id)}
                className="flex items-center gap-1.5 bg-[#e11d48]/15 text-[#ffb3b6] border border-[#e11d48]/30 hover:bg-[#e11d48]/25 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
              >
                <BarChart3 size={10} />
                Live Dashboard
              </button>
              <button
                onClick={() => onPause(event.id)}
                className="flex items-center gap-1.5 bg-[#facc15]/10 text-[#ffb95f] border border-[#facc15]/30 hover:bg-[#facc15]/20 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
              >
                <Pause size={10} />
                Pause
              </button>
            </>
          )}
          {(event.status === "SOLD_OUT" || event.status === "ENDED") && (
            <button
              onClick={() => onViewLive(event.id)}
              className="flex items-center gap-1.5 bg-white/[0.04] text-[#9ca3af] border border-white/[0.08] hover:bg-white/[0.08] px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
            >
              <Eye size={10} />
              View Stats
            </button>
          )}
          <button
            onClick={() => onEdit(event.id)}
            className="flex items-center gap-1.5 bg-white/[0.04] text-[#9ca3af] border border-white/[0.08] hover:bg-white/[0.07] px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer ml-auto"
          >
            <Edit3 size={10} />
            Edit
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Event list row ── */
function EventRow({
  event,
  index,
  onGoLive,
  onPause,
  onViewLive,
  onEdit,
}: {
  event: any;
  index: number;
  onGoLive: (id: string) => void;
  onPause: (id: string) => void;
  onViewLive: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const bv = STATUS_VARIANTS[event.status] ?? "ended";
  const accent = ACCENT_BY_STATUS[event.status] ?? "#9ca3af";

  return (
    <motion.tr
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors group"
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {/* Color dot */}
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
          />
          <div>
            <p className="font-medium text-white text-sm">{event.title}</p>
            {event.artist && event.artist !== event.title && (
              <p className="font-mono text-[10px] uppercase tracking-wider mt-0.5" style={{ color: accent }}>
                {event.artist}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <GlassBadge variant={bv}>{STATUS_LABEL[event.status] ?? event.status}</GlassBadge>
      </td>
      <td className="px-4 py-4 font-mono text-xs text-[#9ca3af]">
        <span className="flex items-center gap-1">
          <MapPin size={9} />
          {event.venue ?? "—"}
        </span>
      </td>
      <td className="px-4 py-4 font-mono text-xs text-[#dfe3e7] tabular-nums">
        {event.capacity?.toLocaleString()}
      </td>
      <td className="px-4 py-4 font-mono text-xs text-[#dfe3e7] tabular-nums">
        {formatPrice(event.ticket_price)}
      </td>
      <td className="px-4 py-4 font-mono text-[10px] text-[#9ca3af]">
        {event.show_date ? formatDate(event.show_date) : "—"}
      </td>
      <td className="px-6 py-4">
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {(event.status === "DRAFT" || event.status === "PAUSED") && (
            <button
              onClick={() => onGoLive(event.id)}
              title="Go Live"
              className="p-1.5 rounded bg-[#00b87c]/15 text-[#00b87c] border border-[#00b87c]/30 hover:bg-[#00b87c]/25 transition-all cursor-pointer"
            >
              <Play size={12} />
            </button>
          )}
          {event.status === "ON_SALE" && (
            <>
              <button
                onClick={() => onViewLive(event.id)}
                title="Live Dashboard"
                className="p-1.5 rounded bg-[#e11d48]/15 text-[#ffb3b6] border border-[#e11d48]/30 hover:bg-[#e11d48]/25 transition-all cursor-pointer"
              >
                <BarChart3 size={12} />
              </button>
              <button
                onClick={() => onPause(event.id)}
                title="Pause"
                className="p-1.5 rounded bg-[#facc15]/10 text-[#ffb95f] border border-[#facc15]/30 hover:bg-[#facc15]/20 transition-all cursor-pointer"
              >
                <Pause size={12} />
              </button>
            </>
          )}
          {(event.status === "SOLD_OUT" || event.status === "ENDED") && (
            <button
              onClick={() => onViewLive(event.id)}
              title="View Stats"
              className="p-1.5 rounded bg-white/[0.04] text-[#9ca3af] border border-white/[0.08] hover:bg-white/[0.08] transition-all cursor-pointer"
            >
              <Eye size={12} />
            </button>
          )}
          <button
            onClick={() => onEdit(event.id)}
            title="Edit"
            className="p-1.5 rounded bg-white/[0.04] text-[#9ca3af] border border-white/[0.08] hover:bg-white/[0.07] transition-all cursor-pointer"
          >
            <Edit3 size={12} />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

/* ── Main Page ── */
const FILTERS = ["ALL", "ON_SALE", "DRAFT", "PAUSED", "SOLD_OUT", "ENDED"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<string, string> = {
  ALL: "All",
  ON_SALE: "Live",
  DRAFT: "Draft",
  PAUSED: "Paused",
  SOLD_OUT: "Sold Out",
  ENDED: "Ended",
};

export default function MerchantEventsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthorized } = useRoleGuard("MERCHANT_ADMIN");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

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
    enabled: isAuthorized,
  });

  const goLiveMut = useMutation({
    mutationFn: (id: string) => api.post(`/merchants/events/${id}/resume`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchant-events"] });
      toast.success("Event is now Live! 🎉");
    },
    onError: () => toast.error("Failed to go live. Please try again."),
  });

  const pauseMut = useMutation({
    mutationFn: (id: string) => api.post(`/merchants/events/${id}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchant-events"] });
      toast.success("Event paused.");
    },
    onError: () => toast.error("Failed to pause event."),
  });

  /* ── Derived data ── */
  const filtered = useMemo(() => {
    let list = events ?? [];
    if (filter !== "ALL") list = list.filter((e: any) => e.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e: any) =>
          e.title?.toLowerCase().includes(q) ||
          e.artist?.toLowerCase().includes(q) ||
          e.venue?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [events, filter, search]);

  const totalEvents = events?.length ?? 0;
  const liveCount = events?.filter((e: any) => e.status === "ON_SALE").length ?? 0;
  const draftCount = events?.filter((e: any) => e.status === "DRAFT").length ?? 0;

  /* ── Handlers ── */
  const handleGoLive = (id: string) => goLiveMut.mutate(id);
  const handlePause = (id: string) => pauseMut.mutate(id);
  const handleViewLive = (id: string) => router.push(`/merchant/events/${id}/live`);
  const handleEdit = (id: string) => router.push(`/merchant/events/${id}/edit`);

  /* ── Auth guard ── */
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
    <main className="min-h-screen bg-[#07070f] text-[#dfe3e7] relative">
      <div className="noise-overlay" />

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-[#e11d48]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[400px] h-[400px] bg-[#facc15]/3 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 px-6 md:px-12 py-12 max-w-7xl mx-auto flex flex-col gap-8">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/[0.06] pb-8"
        >
          <div>
            <span className="font-mono text-[11px] text-[#e11d48] tracking-[0.22em] uppercase font-semibold block mb-2">
              // MERCHANT PORTAL
            </span>
            <h1 className="font-[family-name:var(--font-bebas)] text-5xl sm:text-6xl md:text-7xl text-white tracking-wide leading-none">
              My Events
            </h1>
            <p className="font-mono text-xs text-[#9ca3af] mt-3 uppercase tracking-widest">
              {totalEvents} total &nbsp;·&nbsp; {liveCount} live &nbsp;·&nbsp; {draftCount} draft
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => refetch()}
              className="p-2.5 rounded-xl glass-panel border border-white/[0.08] text-[#9ca3af] hover:text-white hover:border-white/20 transition-all cursor-pointer"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => router.push("/merchant/events/new")}
              className="flex items-center gap-2 bg-[#e11d48] text-white px-6 py-2.5 rounded-xl font-mono text-xs uppercase tracking-widest hover:bg-[#be0037] transition-all glow-button cursor-pointer shadow-[0_0_24px_rgba(225,29,72,0.4)]"
            >
              <Plus size={14} />
              New Event
            </button>
          </div>
        </motion.div>

        {/* ── KPI summary strip ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {[
            { label: "Total Events", value: totalEvents, icon: Ticket, color: "#e11d48" },
            { label: "Live Now", value: liveCount, icon: TrendingUp, color: "#00b87c" },
            { label: "Drafts", value: draftCount, icon: Edit3, color: "#facc15" },
            {
              label: "Ended / Sold Out",
              value: (events?.filter((e: any) => e.status === "ENDED" || e.status === "SOLD_OUT").length ?? 0),
              icon: BarChart3,
              color: "#8b5cf6",
            },
          ].map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              className="glass-panel rounded-xl p-5 flex items-center gap-4 relative overflow-hidden"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${kpi.color}18`, border: `1px solid ${kpi.color}33` }}
              >
                <kpi.icon size={16} style={{ color: kpi.color }} />
              </div>
              <div>
                <p className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-wider">{kpi.label}</p>
                <p className="font-[family-name:var(--font-bebas)] text-3xl text-white leading-none mt-0.5">
                  {isLoading ? "—" : kpi.value}
                </p>
              </div>
              {/* Ambient glow */}
              <div
                className="absolute -top-4 -right-4 w-16 h-16 rounded-full blur-xl opacity-20"
                style={{ background: kpi.color }}
              />
            </motion.div>
          ))}
        </motion.div>

        {/* ── Filter + Search + View Toggle ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
        >
          {/* Filter chips */}
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.15em] transition-all border cursor-pointer",
                  filter === f
                    ? "bg-[#e11d48]/10 border-[#e11d48]/50 text-[#ffb3b6] shadow-[0_0_12px_rgba(225,29,72,0.2)]"
                    : "bg-white/[0.03] border-white/[0.07] text-[#9ca3af] hover:border-white/20 hover:text-[#dfe3e7]"
                )}
              >
                {FILTER_LABELS[f]}
                {f !== "ALL" && events && (
                  <span className="ml-1.5 opacity-60">
                    ({events.filter((e: any) => e.status === f).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search + view toggle */}
          <div className="flex gap-3 items-center">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events..."
                className="bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-4 py-2 font-mono text-xs text-white placeholder:text-[#9ca3af]/60 focus:outline-none focus:border-[#e11d48]/40 focus:bg-white/[0.06] transition-all w-52"
              />
            </div>

            {/* Grid / List toggle */}
            <div className="flex glass-panel rounded-xl overflow-hidden border border-white/[0.08] p-0.5 gap-0.5">
              {(["grid", "list"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "p-2 rounded-lg transition-all cursor-pointer",
                    viewMode === mode
                      ? "bg-[#e11d48]/20 text-[#ffb3b6]"
                      : "text-[#9ca3af] hover:text-white"
                  )}
                >
                  {mode === "grid" ? <LayoutGrid size={13} /> : <List size={13} />}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Content ── */}
        {isError ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel rounded-2xl p-16 text-center"
          >
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-white mb-2 tracking-wide">
              CONNECTION LOST
            </h3>
            <p className="font-mono text-xs text-[#9ca3af] mb-8 uppercase tracking-widest">
              Couldn't load your events.
            </p>
            <button
              onClick={() => refetch()}
              className="bg-[#e11d48] text-white px-8 py-3 rounded-xl font-mono text-xs uppercase tracking-widest hover:bg-[#be0037] transition-all glow-button cursor-pointer"
            >
              Retry Connection
            </button>
          </motion.div>
        ) : viewMode === "grid" ? (
          /* ── Grid View ── */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {isLoading
                ? [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
                : filtered.length === 0
                ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="md:col-span-2 xl:col-span-3 glass-panel rounded-2xl p-16 text-center"
                  >
                    <div className="text-5xl mb-4">🎪</div>
                    <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-white mb-2 tracking-wide">
                      NO EVENTS FOUND
                    </h3>
                    <p className="font-mono text-xs text-[#9ca3af] mb-8 uppercase tracking-widest">
                      {search ? "Try a different search term." : "Create your first event to open your queue."}
                    </p>
                    {!search && (
                      <button
                        onClick={() => router.push("/merchant/events/new")}
                        className="inline-flex items-center gap-2 bg-[#e11d48] text-white px-8 py-3 rounded-xl font-mono text-xs uppercase tracking-widest hover:bg-[#be0037] transition-all glow-button cursor-pointer"
                      >
                        <Plus size={14} />
                        Create Event
                      </button>
                    )}
                  </motion.div>
                )
                : filtered.map((event: any, index: number) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={index}
                    onGoLive={handleGoLive}
                    onPause={handlePause}
                    onViewLive={handleViewLive}
                    onEdit={handleEdit}
                  />
                ))}
            </AnimatePresence>
          </div>
        ) : (
          /* ── List View ── */
          <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.06]">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    {["Event", "Status", "Venue", "Capacity", "Price", "Show Date", "Actions"].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-4 text-[#9ca3af] font-semibold uppercase tracking-wider text-[10px]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {isLoading
                      ? [...Array(5)].map((_, i) => (
                        <tr key={i} className="border-b border-white/[0.05]">
                          {[...Array(7)].map((__, j) => (
                            <td key={j} className="px-6 py-4">
                              <div
                                className="h-3 rounded bg-white/[0.04] animate-pulse"
                                style={{ width: j === 0 ? "70%" : "50%" }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))
                      : filtered.length === 0
                      ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-16 text-center text-[#9ca3af]">
                            <div className="flex flex-col items-center gap-3">
                              <span className="text-3xl">🎪</span>
                              <p className="uppercase tracking-widest text-[10px]">
                                {search ? "No events match your search." : "No events yet."}
                              </p>
                              {!search && (
                                <button
                                  onClick={() => router.push("/merchant/events/new")}
                                  className="text-[#e11d48] hover:text-[#ffb3b6] transition-colors cursor-pointer"
                                >
                                  + Create Event
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                      : filtered.map((event: any, index: number) => (
                        <EventRow
                          key={event.id}
                          event={event}
                          index={index}
                          onGoLive={handleGoLive}
                          onPause={handlePause}
                          onViewLive={handleViewLive}
                          onEdit={handleEdit}
                        />
                      ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Footer CTA when no events ── */}
        {!isLoading && !isError && totalEvents === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-10 flex flex-col md:flex-row items-center justify-between gap-6 border border-dashed border-white/[0.1]"
          >
            <div>
              <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-white tracking-wide">
                READY TO LAUNCH YOUR FIRST EVENT?
              </h2>
              <p className="font-mono text-xs text-[#9ca3af] mt-2 uppercase tracking-widest">
                Configure your queue, set admission rates, and go live in minutes.
              </p>
            </div>
            <button
              onClick={() => router.push("/merchant/events/new")}
              className="flex items-center gap-2 bg-[#e11d48] text-white px-8 py-4 rounded-xl font-mono text-sm uppercase tracking-widest hover:bg-[#be0037] transition-all glow-button cursor-pointer shadow-[0_0_24px_rgba(225,29,72,0.4)] shrink-0"
            >
              Create Event <ChevronRight size={16} />
            </button>
          </motion.div>
        )}
      </div>
    </main>
  );
}
