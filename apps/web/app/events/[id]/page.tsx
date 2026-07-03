"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { StadiumMap } from "@/components/StadiumMap";
import { api } from "@/lib/api";
import { GlassBadge } from "@/components/glass/GlassBadge";
import { useQueueStore } from "@/stores/queue-store";
import { toast } from "sonner";
import { Check, Loader2, MapPin, Calendar, Timer, ArrowLeft, Lock } from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";

/* ── Flip digit — Stagedoor yellow flip-clock style ── */
function FlipDigit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-14 sm:h-20 overflow-hidden flex items-center justify-center min-w-[56px] sm:min-w-[72px]">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={value}
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -28, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="font-[family-name:var(--font-bebas)] text-5xl sm:text-7xl text-[#facc15] tracking-wide leading-none select-none filter drop-shadow-[0_0_14px_rgba(250,204,21,0.5)] absolute"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="font-mono text-[9px] text-[#9ca3af] tracking-[0.2em] font-semibold uppercase">
        {label}
      </span>
    </div>
  );
}

function useCountdownTo(dateStr: string | null) {
  const [remaining, setRemaining] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    if (!dateStr) return;
    const update = () => {
      const diff = Math.max(0, new Date(dateStr).getTime() - Date.now());
      setRemaining({
        d: Math.floor(diff / 86_400_000),
        h: Math.floor((diff % 86_400_000) / 3_600_000),
        m: Math.floor((diff % 3_600_000) / 60_000),
        s: Math.floor((diff % 60_000) / 1_000),
      });
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [dateStr]);

  return remaining;
}

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();
}

function formatTime(dateStr: string | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_BADGE_MAP: Record<string, "live" | "upcoming" | "ended"> = {
  ON_SALE: "live",
  UPCOMING: "upcoming",
  ENDED: "ended",
};

export default function EventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { isReady } = useAuthGuard();
  const eventId = params.id;
  const setQueueState = useQueueStore((s) => s.setQueueState);
  const setCategory   = useQueueStore((s) => s.setCategory);

  const [joining, setJoining] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStep, setVerifyStep] = useState(0);
  const [shakeError, setShakeError] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // ── Real data: GET /events/:id ──
  const { data: event, isLoading, isError, refetch } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const res = await api.get(`/events/${eventId}`);
      return res.data;
    },
    enabled: isReady,
  });

  // Use show_date (real field) for countdown; fall back to null
  const countdown = useCountdownTo(event?.show_date ?? null);
  const pad = (n: number) => n.toString().padStart(2, "0");

  // ── Real join queue logic ──
  const handleJoinQueue = useCallback(async () => {
    const categories: any[] = event?.ticket_categories ?? [];
    if (categories.length > 0 && !selectedCategoryId) {
      toast.error("Please select a ticket category before joining the queue.");
      return;
    }

    setJoining(true);
    setIsVerifying(true);
    setVerifyStep(1);

    let sessionId = localStorage.getItem("queuegate_session_id");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem("queuegate_session_id", sessionId);
    }

    setTimeout(() => setVerifyStep(2), 800);

    try {
      const res = await api.post(`/events/${eventId}/join`, {
        sessionId,
        ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
      });

      if (res.data.wsToken) {
        localStorage.setItem("queuegate_ws_token", res.data.wsToken);
      }

      // Persist selected category into the queue store
      if (selectedCategoryId) {
        const cat = categories.find((c: any) => c.id === selectedCategoryId);
        if (cat) {
          setCategory({
            categoryId:    cat.id,
            categoryName:  cat.name,
            categoryPrice: cat.price,
            categoryColor: cat.color,
          });
        }
      }

      setQueueState({
        position:  res.data.position,
        total:     res.data.total,
        etaSeconds: res.data.etaSeconds,
        status:    "WAITING",
        sessionId,
        eventId,
      });

      setVerifyStep(3);
      setTimeout(() => {
        router.push(`/events/${eventId}/waiting-room`);
      }, 1200);
    } catch (err: any) {
      setIsVerifying(false);
      setVerifyStep(0);
      setJoining(false);
      const status  = err.response?.status;
      const message = err.response?.data?.message || "";

      if (status === 409) {
        toast.info("You are already in the queue. Redirecting...");
        router.push(`/events/${eventId}/waiting-room`);
        return;
      }

      setShakeError(true);
      setTimeout(() => setShakeError(false), 600);

      if (status === 429) {
        toast.error("Too many attempts. Try again in 60s.");
      } else if (message.toLowerCase().includes("sold out")) {
        toast.error(message);
      } else if (message.toLowerCase().includes("capacity") || message.toLowerCase().includes("full")) {
        toast.error("This event is at capacity.");
      } else {
        toast.error(message || "Failed to join queue. Try again.");
      }
    }
  }, [eventId, router, setQueueState, setCategory, selectedCategoryId, event?.ticket_categories]);

  /* ── Not authenticated (redirecting) ── */
  if (!isReady) return null;

  /* ── Loading ── */
  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#07070f] text-[#dfe3e7]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-12 min-h-[85vh] flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-1 bg-[#e11d48] mx-auto rounded-full animate-pulse" />
            <div className="font-[family-name:var(--font-bebas)] text-2xl text-[#9ca3af] tracking-widest animate-pulse">
              LOADING EVENT DATA...
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ── Error ── */
  if (isError) {
    return (
      <main className="min-h-screen bg-[#07070f] flex items-center justify-center text-[#dfe3e7]">
        <div className="glass-panel p-12 rounded-xl text-center max-w-sm w-full">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="font-[family-name:var(--font-bebas)] text-2xl text-white mb-2 tracking-wide">
            SIGNAL LOST
          </h2>
          <p className="font-mono text-xs text-[#9ca3af] mb-6 uppercase tracking-widest">
            Couldn&apos;t load this event.
          </p>
          <button
            onClick={() => refetch()}
            className="bg-[#e11d48] text-white px-8 py-3 rounded font-mono text-xs uppercase tracking-widest hover:bg-[#be0037] transition-all w-full cursor-pointer glow-button"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const capacityPercent = Math.min(
    ((event.admitted_count || 0) / (event.capacity || 1)) * 100,
    100
  );

  const badgeVariant: "live" | "upcoming" | "ended" =
    STATUS_BADGE_MAP[event.status] ?? "ended";

  const showCountdown = event.status === "UPCOMING" || event.status === "ON_SALE";
  const selectedCategory = event?.ticket_categories?.find((c: any) => c.id === selectedCategoryId);

  return (
    <main className="min-h-screen bg-[#07070f] text-[#dfe3e7] flex flex-col">
      {/* ── Top Bar ── */}
      <div className="w-full bg-[#161a1d] border-b border-white/[0.05] h-16 flex items-center justify-between px-6 md:px-12 z-20 sticky top-0">
        <button
          onClick={() => router.push("/events")}
          className="flex items-center gap-2 text-[#9ca3af] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span className="font-mono text-xs uppercase tracking-wider font-semibold">
            Back to Events
          </span>
        </button>
      </div>

      <div className="px-6 md:px-12 w-full max-w-[1600px] mx-auto flex flex-col xl:flex-row gap-8 pt-8 pb-32">
        
        {/* ── LEFT: Map or Hero Image ── */}
        <section className="flex-grow flex flex-col gap-6 relative min-h-[500px] xl:min-h-[700px] w-full xl:w-2/3">
          {(event?.ticket_categories?.length ?? 0) > 0 ? (
            <StadiumMap 
              categories={event.ticket_categories} 
              selectedCategoryId={selectedCategoryId} 
              onSelectCategory={setSelectedCategoryId} 
            />
          ) : (
            <div className="relative w-full h-full rounded-xl overflow-hidden border border-white/[0.05]">
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: event?.image_url
                    ? `url('${event.image_url}')`
                    : "url('/concert-hero.jpg')",
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#07070f] via-black/40 to-transparent" />
            </div>
          )}
        </section>

        {/* ── RIGHT: Order / Info Tray Sidebar ── */}
        <aside className="w-full xl:w-[420px] flex-shrink-0 flex flex-col gap-6 xl:sticky xl:top-[100px] h-fit">
          <div className="bg-[#161a1d] rounded-xl p-6 md:p-8 flex flex-col gap-6 shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-white/[0.05]">

            {/* Header + Timer */}
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-5">
              <h1 className="font-[family-name:var(--font-bebas)] text-3xl text-white uppercase tracking-wider">
                Event Info
              </h1>
              {showCountdown && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0a0f12] rounded border border-white/[0.1]">
                  <Timer size={14} className="text-[#9ca3af]" />
                  <span className="font-mono text-sm leading-none font-bold tracking-widest text-[#ffb95f]">
                    {pad(countdown.d)}:{pad(countdown.h)}:{pad(countdown.m)}:{pad(countdown.s)}
                  </span>
                </div>
              )}
            </div>

            {/* Event Summary */}
            <div className="flex gap-5 items-center">
              <div 
                className="w-16 h-16 bg-[#262b2e] bg-cover bg-center rounded border border-white/[0.05] flex-shrink-0"
                style={{ backgroundImage: `url('${event?.image_url || "/concert-hero.jpg"}')` }}
              />
              <div className="flex flex-col justify-center">
                <h2 className="font-[family-name:var(--font-bebas)] text-2xl text-white leading-none uppercase tracking-wide mb-1">
                  {event.artist || event.title}
                </h2>
                <p className="font-mono text-xs text-[#9ca3af]">
                  {event.venue || "TBA"}
                </p>
                <p className="font-mono text-[10px] text-[#9ca3af] mt-1.5 uppercase tracking-widest">
                  {formatDate(event.show_date)} • {formatTime(event.show_date)}
                </p>
              </div>
            </div>

            {/* Line items */}
            <div className="flex flex-col gap-3 mt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-sans text-sm font-semibold text-white" style={selectedCategory ? { color: selectedCategory.color } : {}}>
                    {selectedCategory ? selectedCategory.name : "Select a Zone"}
                  </div>
                  <div className="font-mono text-[11px] text-[#9ca3af] mt-1.5 max-w-[200px]">
                    {selectedCategory?.description || "General Admission"}
                  </div>
                </div>
                <div className="font-mono text-base font-semibold text-white">
                  ${selectedCategory ? selectedCategory.price.toLocaleString() : (event.ticket_price || 0).toLocaleString()}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-4 border-t border-white/[0.05]">
                <div className="font-sans text-xs text-[#9ca3af]">
                  Service Fee
                </div>
                <div className="font-mono text-xs text-[#9ca3af]">
                  $4.50
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="flex items-end justify-between pt-5 border-t border-white/[0.08] mt-2 mb-2">
              <div className="font-mono text-xs text-white uppercase tracking-widest font-bold">
                Total
              </div>
              <div className="font-[family-name:var(--font-bebas)] text-4xl text-[#e11d48] tracking-wider leading-none">
                ${((selectedCategory ? selectedCategory.price : (event.ticket_price || 0)) + 4.50).toLocaleString()}
              </div>
            </div>

            {/* Verification HUD */}
            <AnimatePresence mode="wait">
              {isVerifying && (
                <motion.div
                  initial={{ opacity: 0, height: 0, scale: 0.95 }}
                  animate={{ opacity: 1, height: "auto", scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.95 }}
                  className="bg-black/60 border border-[#ffb3b6]/20 p-4 rounded-lg flex items-center gap-4 mb-2 overflow-hidden"
                >
                  {verifyStep < 3 ? (
                    <Loader2 size={24} className="text-[#e11d48] animate-spin shrink-0" />
                  ) : (
                    <Check size={24} className="text-[#00b87c] shrink-0" />
                  )}
                  <div className="flex flex-col">
                    <span className="font-mono text-[10px] text-[#ffb3b6] font-semibold tracking-wider uppercase">
                      {verifyStep === 1 && "SHIELD WALL ANTI-BOT SCAN ACTIVE"}
                      {verifyStep === 2 && "ALLOCATING CRYPTOGRAPHIC KEY"}
                      {verifyStep === 3 && "CLEARED! CONNECTING TO QUEUE..."}
                    </span>
                    <span className="font-sans text-[10px] text-[#9ca3af] mt-1">
                      {verifyStep === 1 && "Verifying session and fingerprint..."}
                      {verifyStep === 2 && "Binding session to queue tunnel..."}
                      {verifyStep === 3 && "Queue clearance ticket generated!"}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Message */}
            <AnimatePresence>
              {shakeError && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-[#e11d48] font-mono text-xs text-center uppercase tracking-widest mt-[-8px] mb-2"
                >
                  Could not process request
                </motion.div>
              )}
            </AnimatePresence>

            {/* Join Queue CTA */}
            {!isVerifying && (
              <motion.button
                whileHover={
                  event.status === "ON_SALE" && !joining && !((event?.ticket_categories?.length ?? 0) > 0 && !selectedCategoryId)
                    ? { scale: 1.02 }
                    : {}
                }
                whileTap={
                  event.status === "ON_SALE" && !joining && !((event?.ticket_categories?.length ?? 0) > 0 && !selectedCategoryId)
                    ? { scale: 0.98 }
                    : {}
                }
                animate={shakeError ? { x: [0, -10, 10, -10, 10, -5, 5, 0] } : { x: 0 }}
                transition={{ duration: 0.5 }}
                onClick={handleJoinQueue}
                disabled={
                  event.status !== "ON_SALE" ||
                  joining ||
                  ((event?.ticket_categories?.length ?? 0) > 0 && !selectedCategoryId)
                }
                className={`w-full py-5 rounded font-[family-name:var(--font-bebas)] text-2xl uppercase tracking-[0.15em] flex justify-center items-center gap-2 transition-all duration-300 cursor-pointer ${
                  event.status === "ON_SALE" && !joining &&
                  !((event?.ticket_categories?.length ?? 0) > 0 && !selectedCategoryId)
                    ? "bg-[#e11d48] hover:bg-[#ff1a4b] text-white shadow-[0_0_24px_rgba(225,29,72,0.45)] glow-button"
                    : "bg-white/[0.06] text-[#9ca3af] cursor-not-allowed"
                }`}
              >
                <Lock size={20} />
                {joining
                  ? "JOINING..."
                  : event.status === "ON_SALE"
                  ? "JOIN QUEUE"
                  : event.status === "UPCOMING"
                  ? "OPENS SOON"
                  : event.status === "SOLD_OUT"
                  ? "SOLD OUT"
                  : "EVENT ENDED"}
              </motion.button>
            )}

            <p className="text-center font-sans text-[10px] text-[#9ca3af]/50 uppercase tracking-widest mt-[-4px]">
              Powered by QueueGate Tech
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
