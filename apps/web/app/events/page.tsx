"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { GlassBadge } from "@/components/glass/GlassBadge";
import { cn } from "@/lib/utils";
import { MapPin, Calendar, Users, Ticket } from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const FILTERS = ["ALL", "ON_SALE", "UPCOMING", "ENDED"] as const;
type Filter = (typeof FILTERS)[number];

/* ── Per-event colour palette cycling ── */
const CARD_THEMES = [
  { glow: "rgba(225,29,72,0.55)",  accent: "#e11d48",  bg: "from-[#5a0019]/60 via-[#1a0008]/70 to-[#07070f]/95" },
  { glow: "rgba(250,204,21,0.45)", accent: "#facc15",  bg: "from-[#4a3500]/60 via-[#1c1400]/70 to-[#07070f]/95" },
  { glow: "rgba(139,92,246,0.45)", accent: "#8b5cf6",  bg: "from-[#2e1065]/60 via-[#0e0526]/70 to-[#07070f]/95" },
  { glow: "rgba(6,182,212,0.40)",  accent: "#06b6d4",  bg: "from-[#003540]/60 via-[#001318]/70 to-[#07070f]/95" },
  { glow: "rgba(249,115,22,0.45)", accent: "#f97316",  bg: "from-[#431407]/60 via-[#1a0700]/70 to-[#07070f]/95" },
  { glow: "rgba(16,185,129,0.40)", accent: "#10b981",  bg: "from-[#022c22]/60 via-[#00100c]/70 to-[#07070f]/95" },
];

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return "TBA";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }).toUpperCase();
}

function formatPrice(price: number | undefined) {
  if (!price && price !== 0) return "—";
  if (price === 0) return "Free";
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const STATUS_DISPLAY: Record<string, string> = {
  ON_SALE: "LIVE ON SALE",
  UPCOMING: "UPCOMING",
  ENDED: "ENDED",
  SOLD_OUT: "SOLD OUT",
};

const cardVariants = {
  hidden:  { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] as any } },
  exit:    { opacity: 0, scale: 0.95 },
};

/* ── Big decorative initial letter behind the card image area ── */
function CardInitial({ char, color }: { char: string; color: string }) {
  return (
    <span
      className="absolute inset-0 flex items-center justify-center font-[family-name:var(--font-bebas)] select-none pointer-events-none"
      style={{
        fontSize: "clamp(140px, 30vw, 220px)",
        lineHeight: 1,
        color: color,
        opacity: 0.07,
        filter: `drop-shadow(0 0 40px ${color})`,
      }}
    >
      {char}
    </span>
  );
}

export default function EventsCatalogPage() {
  const router = useRouter();
  const { isReady } = useAuthGuard();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [, setTick] = useState(0);

  // Refresh relative timestamps every 30 seconds
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const res = await api.get("/events");
      return res.data;
    },
    enabled: isReady,
  });

  const allEvents: any[] = data?.data ?? data ?? [];

  const filtered = useMemo(() => {
    if (filter === "ALL") return allEvents;
    return allEvents.filter((e: any) => e.status === filter);
  }, [allEvents, filter]);

  if (!isReady) return null;

  return (
    <main className="min-h-screen bg-[#07070f] text-[#dfe3e7] relative">
      <div className="noise-overlay" />

      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-[#e11d48]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-[#facc15]/4 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 px-6 md:px-12 py-14 max-w-7xl mx-auto">

        {/* ── Header ── */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="mb-10"
        >
          <span className="font-mono text-[11px] text-[#e11d48] tracking-[0.22em] uppercase font-semibold block mb-3">
            // SECURE QUEUE PORTAL
          </span>
          <h1 className="font-[family-name:var(--font-bebas)] text-[clamp(3.5rem,10vw,7rem)] text-white leading-none uppercase tracking-tight mb-4">
            Live Events
          </h1>
          <p className="font-sans text-[15px] text-[#9ca3af] max-w-xl leading-relaxed">
            High-octane performances and exclusive live events. Secured by
            QueueGate cryptographic queue tunnels. Select your event to request
            queue clearance.
          </p>
        </motion.header>

        {/* ── Filter chips ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex gap-2.5 mb-12 flex-wrap"
        >
          {FILTERS.map((f) => (
            <button
              key={f}
              id={`filter-${f.toLowerCase()}`}
              onClick={() => setFilter(f)}
              className={cn(
                "px-5 py-2 rounded font-mono text-[10px] uppercase tracking-[0.18em] transition-all border cursor-pointer",
                filter === f
                  ? "bg-[#e11d48]/10 border-[#e11d48]/50 text-[#ffb3b6] shadow-[0_0_14px_rgba(225,29,72,0.25)]"
                  : "bg-white/[0.04] border-white/[0.08] text-[#9ca3af] hover:border-white/20 hover:text-[#dfe3e7] hover:bg-white/[0.06]"
              )}
            >
              {f === "ON_SALE" ? "LIVE ON SALE" : f}
            </button>
          ))}
        </motion.div>

        {/* ── States ── */}
        {isError ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-16 text-center rounded-2xl"
          >
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-white mb-2 tracking-wide">
              SIGNAL LOST
            </h3>
            <p className="font-mono text-xs text-[#9ca3af] mb-8 uppercase tracking-widest">
              Couldn&apos;t load events right now.
            </p>
            <button
              onClick={() => refetch()}
              className="bg-[#e11d48] text-white px-8 py-3 rounded font-mono text-xs uppercase tracking-widest hover:bg-[#be0037] transition-all cursor-pointer glow-button"
            >
              Retry Connection
            </button>
          </motion.div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden animate-pulse"
                style={{ height: 420, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-16 text-center rounded-2xl"
          >
            <div className="text-5xl mb-4 animate-pulse">🎫</div>
            <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-white mb-2 tracking-wide">
              NO EVENTS FOUND
            </h3>
            <p className="font-mono text-xs text-[#9ca3af] uppercase tracking-widest">
              Check back soon — new experiences launch every day.
            </p>
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence mode="popLayout">
              {filtered.map((event: any, index: number) => {
                const theme = CARD_THEMES[index % CARD_THEMES.length];
                const badgeVariant =
                  event.status === "ON_SALE"
                    ? "live"
                    : event.status === "UPCOMING"
                    ? "upcoming"
                    : "ended";

                const capacityPercent = Math.min(
                  ((event.admitted_count || 0) / (event.capacity || 1)) * 100,
                  100
                );
                const isHighCapacity = capacityPercent >= 75;
                const isFeatured = index === 0;

                return (
                  <motion.div
                    key={event.id}
                    layout
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ delay: index * 0.07 }}
                    whileHover={{
                      scale: 1.012,
                      boxShadow: `0 24px 48px rgba(0,0,0,0.7), 0 0 0 1px ${theme.glow}`,
                    }}
                    whileTap={{ scale: 0.995 }}
                    onClick={() => router.push(`/events/${event.id}`)}
                    className={cn(
                      "relative rounded-2xl overflow-hidden cursor-pointer group transition-all duration-300",
                      isFeatured ? "md:col-span-2" : ""
                    )}
                    style={{
                      background: "rgba(255,255,255,0.025)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {/* ── Image / hero area ── */}
                    <div
                      className={cn(
                        "relative overflow-hidden w-full",
                        isFeatured ? "h-72 md:h-[340px]" : "h-52"
                      )}
                    >
                      {/* Full-bleed concert hero — uses the required event.image_url, with fallback just in case */}
                      <div
                        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55 group-hover:opacity-65 transition-opacity duration-700"
                        style={{ backgroundImage: `url('${event.image_url || '/concert-hero.jpg'}')` }}
                      />

                      {/* Colour gradient overlay */}
                      <div
                        className={`absolute inset-0 bg-gradient-to-b ${theme.bg}`}
                      />

                      {/* Decorative initial */}
                      <CardInitial char={event.title?.charAt(0) ?? "?"} color={theme.accent} />

                      {/* Shine sweep on hover */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-gradient-to-r from-transparent via-white/5 to-transparent" />

                      {/* Status badge */}
                      <div className="absolute top-4 right-4 z-20">
                        <GlassBadge variant={badgeVariant}>
                          {STATUS_DISPLAY[event.status] ?? event.status}
                        </GlassBadge>
                      </div>

                      {/* Ticket price badge */}
                      {event.ticket_price != null && (
                        <div
                          className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider"
                          style={{
                            background: `${theme.accent}22`,
                            border: `1px solid ${theme.accent}44`,
                            color: theme.accent,
                          }}
                        >
                          <Ticket size={10} />
                          {formatPrice(event.ticket_price)}
                        </div>
                      )}

                      {/* Bottom gradient fade into card body */}
                      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[#0c0c14] to-transparent" />
                    </div>

                    {/* ── Card body ── */}
                    <div className="px-6 pb-6 pt-4 bg-[#0c0c14]">
                      {/* Title */}
                      <h2
                        className={cn(
                          "font-[family-name:var(--font-bebas)] tracking-wide leading-none mb-1 transition-colors duration-300",
                          isFeatured ? "text-5xl md:text-6xl" : "text-4xl",
                          "text-white group-hover:text-[#ffb3b6]"
                        )}
                      >
                        {event.title}
                      </h2>

                      {/* Artist sub-label */}
                      {event.artist && event.artist !== event.title && (
                        <p
                          className="font-mono text-sm uppercase tracking-[0.14em] font-semibold mb-4"
                          style={{ color: theme.accent }}
                        >
                          {event.artist}
                        </p>
                      )}

                      {/* Meta row */}
                      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 mb-5">
                        {event.venue && (
                          <span className="flex items-center gap-1.5 font-mono text-xs text-[#9ca3af]">
                            <MapPin size={11} className="shrink-0" style={{ color: theme.accent }} />
                            {event.venue}
                          </span>
                        )}
                        {event.show_date && (
                          <span className="flex items-center gap-1.5 font-mono text-xs text-[#9ca3af]">
                            <Calendar size={11} className="shrink-0" style={{ color: theme.accent }} />
                            {formatDate(event.show_date)}
                          </span>
                        )}
                        {event.queueDepth > 0 && (
                          <span className="flex items-center gap-1.5 font-mono text-xs text-[#9ca3af]">
                            <Users size={11} className="shrink-0" style={{ color: theme.accent }} />
                            {event.queueDepth.toLocaleString()} in queue
                          </span>
                        )}
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-white/[0.06] mb-4" />

                      {/* Capacity bar row */}
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-[0.15em]">
                          Capacity
                        </span>
                        <span
                          className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${
                            isHighCapacity ? "text-[#e11d48]" : "text-[#ffb95f]"
                          }`}
                        >
                          {capacityPercent.toFixed(0)}% Secured
                        </span>
                      </div>

                      <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${capacityPercent}%` }}
                          transition={{ duration: 1.4, ease: [0.25, 1, 0.5, 1], delay: 0.3 }}
                          className="h-full rounded-full"
                          style={{
                            background: isHighCapacity
                              ? "linear-gradient(90deg, #e11d48, #ff4d6d)"
                              : `linear-gradient(90deg, ${theme.accent}, ${theme.accent}cc)`,
                            boxShadow: `0 0 8px ${isHighCapacity ? "#e11d48" : theme.accent}66`,
                          }}
                        />
                      </div>

                      {/* Capacity numbers */}
                      <div className="flex justify-between mt-2">
                        <span className="font-mono text-[10px] text-[#9ca3af]">
                          {(event.admitted_count || 0).toLocaleString()} admitted
                        </span>
                        <span className="font-mono text-[10px] text-[#9ca3af]">
                          {event.capacity?.toLocaleString() ?? "—"} total
                        </span>
                      </div>
                    </div>

                    {/* ── Hover CTA strip at bottom ── */}
                    <div
                      className="absolute bottom-0 inset-x-0 h-0 group-hover:h-12 overflow-hidden transition-all duration-300 flex items-center justify-center"
                      style={{ background: `linear-gradient(90deg, ${theme.accent}dd, ${theme.accent})` }}
                    >
                      <span className="font-[family-name:var(--font-bebas)] text-xl text-white tracking-[0.15em] opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100">
                        {event.status === "ON_SALE"
                          ? "JOIN QUEUE →"
                          : event.status === "UPCOMING"
                          ? "VIEW DETAILS →"
                          : "VIEW EVENT →"}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </main>
  );
}
