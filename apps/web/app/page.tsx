"use client";

import { motion, useScroll, useTransform, AnimatePresence, type Transition, type TargetAndTransition } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowRight, ArrowUpRight, Shield, Zap, Ticket, Users, ChevronDown, Play } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";

/* ══════════════════════════════════════════════════
   VIDEO CROSSFADE
══════════════════════════════════════════════════ */
type MotionInitial = boolean | TargetAndTransition;
type MotionAnimate = TargetAndTransition;
type MotionExit = TargetAndTransition;

type Effect = {
  enter: { initial: MotionInitial; animate: MotionAnimate; transition: Transition };
  exit:  { exit: MotionExit; transition: Transition };
};

const TRANSITION_EFFECTS: Effect[] = [
  {
    enter: { initial: { opacity: 0, scale: 1.08 }, animate: { opacity: 0.55, scale: 1.01 }, transition: { duration: 2.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
    exit:  { exit: { opacity: 0, scale: 0.97 }, transition: { duration: 2, ease: "easeIn" as const } },
  },
  {
    enter: { initial: { opacity: 0, x: 80, scale: 1.04 }, animate: { opacity: 0.55, x: 0, scale: 1 }, transition: { duration: 2.2, ease: [0.215, 0.61, 0.355, 1] as [number, number, number, number] } },
    exit:  { exit: { opacity: 0, x: -80, scale: 0.98 }, transition: { duration: 1.8, ease: "easeIn" as const } },
  },
  {
    enter: { initial: { opacity: 0, scale: 1.2 }, animate: { opacity: 0.55, scale: 1 }, transition: { duration: 2.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
    exit:  { exit: { opacity: 0, scale: 1.06 }, transition: { duration: 1.6, ease: "easeIn" as const } },
  },
];

function VideoCrossfade({ videos, interval = 10000 }: { videos: string[]; interval?: number }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [effectIndex, setEffectIndex] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    if (videos.length <= 1) return;
    const timer = setInterval(() => {
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 500);
      setCurrentIndex((p) => (p + 1) % videos.length);
      setEffectIndex((p) => (p + 1) % TRANSITION_EFFECTS.length);
    }, interval);
    return () => clearInterval(timer);
  }, [videos, interval]);

  const eff = TRANSITION_EFFECTS[effectIndex];

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#07070f]">
      <AnimatePresence>
        {isFlashing && (
          <motion.div key="flash" className="absolute inset-0 z-30 pointer-events-none"
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0.22, 0] }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{ background: "radial-gradient(ellipse at center, rgba(225,29,72,0.35) 0%, rgba(7,7,15,0.1) 70%)" }} />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false} mode="sync">
        <motion.video key={currentIndex} src={videos[currentIndex]} autoPlay muted loop playsInline
          initial={eff.enter.initial} animate={eff.enter.animate}
          exit={{ ...eff.exit.exit, transition: eff.exit.transition }}
          transition={eff.enter.transition}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: "brightness(0.38) saturate(1.4) contrast(1.1)" }} />
      </AnimatePresence>
      {/* Persistent cinematic vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(7,7,15,0.75) 100%)" }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(7,7,15,0.5) 0%, transparent 25%, transparent 65%, rgba(7,7,15,1) 100%)" }} />
    </div>
  );
}

/* ══════════════════════════════════════════════════
   ANIMATED NUMBER COUNTER
══════════════════════════════════════════════════ */
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let f = 0;
    const t = setInterval(() => { f++; setV(Math.round((f / 80) * to)); if (f >= 80) clearInterval(t); }, 20);
    return () => clearInterval(t);
  }, [to]);
  return <>{v.toLocaleString()}{suffix}</>;
}

/* ══════════════════════════════════════════════════
   FEATURE CARD
══════════════════════════════════════════════════ */
function FeatureCard({ icon: Icon, color, title, desc, wide }: {
  icon: any; color: string; title: string; desc: string; wide?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      whileHover={{ y: -6, boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px ${color}33` }}
      transition={{ duration: 0.5 }}
      className={`relative bg-[#0c0f14] border border-white/[0.06] rounded-3xl p-8 overflow-hidden group ${wide ? "lg:col-span-2" : ""}`}
    >
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${color} 40%, transparent 100%)` }} />
      {/* Glow */}
      <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full blur-3xl opacity-10 group-hover:opacity-25 transition-opacity"
        style={{ background: color }} />

      <div className="relative z-10">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 border"
          style={{ background: `${color}14`, borderColor: `${color}28` }}>
          <Icon size={20} style={{ color }} />
        </div>
        <h3 className="font-[family-name:var(--font-bebas)] text-3xl text-white tracking-wide mb-3">{title}</h3>
        <p className="text-sm text-white/50 leading-relaxed">{desc}</p>
        {wide && (
          <div className="flex flex-wrap gap-2 mt-6">
            {["FIFO Queue", "Rate Limiting", "Token Signing", "IP Shield", "Edge Protection"].map(t => (
              <span key={t} className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded-full border"
                style={{ borderColor: `${color}30`, color: `${color}cc`, background: `${color}0a` }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════
   EVENT CARD
══════════════════════════════════════════════════ */
function EventCard({ event, index, onClick }: { event: any; index: number; onClick: () => void }) {
  const accents = ["#e11d48", "#a855f7", "#f59e0b"];
  const accent = accents[index % 3];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }} transition={{ delay: index * 0.1, duration: 0.6 }}
      whileHover={{ y: -10 }}
      onClick={onClick}
      className="group relative h-[480px] rounded-3xl overflow-hidden cursor-pointer"
      style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
    >
      {/* Accent top border */}
      <div className="absolute top-0 left-0 right-0 h-[2px] z-10"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

      {/* Background */}
      {event.image_url ? (
        <img src={event.image_url} alt={event.title}
          className="absolute inset-0 w-full h-full object-cover transition-all duration-700 group-hover:scale-110"
          style={{ filter: "brightness(0.35) saturate(1.3)" }} />
      ) : (
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-700 group-hover:scale-110"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1522158637959-30385a09e0da?w=600&auto=format&fit=crop&q=60')",
            filter: "brightness(0.28) saturate(1.4)"
          }} />
      )}

      {/* Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(ellipse at 50% 120%, ${accent}20, transparent 60%)` }} />

      {/* Live badge */}
      <div className="absolute top-5 left-5 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border"
        style={{ borderColor: `${accent}40`, background: `${accent}15` }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} />
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: accent }}>Live On Sale</span>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-7 z-10">
        <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-2">{event.venue ?? "Venue TBA"}</p>
        <h3 className="font-[family-name:var(--font-bebas)] text-4xl text-white leading-none mb-1 group-hover:text-white transition-colors"
          style={{ textShadow: `0 0 30px ${accent}60` }}>
          {event.artist ?? event.title}
        </h3>
        <p className="text-xs text-white/40 mb-5">{event.title !== event.artist ? event.title : ""}</p>
        <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
          <span className="font-mono text-xs text-white/50">
            {event.show_date
              ? new Date(event.show_date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase()
              : "DATE TBA"}
          </span>
          <span className="font-mono text-xs flex items-center gap-1.5 transition-colors" style={{ color: accent }}>
            Get Tickets <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */
export default function LandingPage() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const bgY = useTransform(scrollY, [0, 700], [0, 60]);
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0]);
  const textY = useTransform(scrollY, [0, 400], [0, -60]);

  const { data } = useQuery({
    queryKey: ["events-home"],
    queryFn: async () => { const r = await api.get("/events?limit=20"); return r.data; },
    refetchInterval: 30_000,
  });

  const events: any[] = data?.data ?? data ?? [];
  const onSale = events.filter((e: any) => e.status === "ON_SALE");
  const queueTotal = onSale.reduce((s: number, e: any) => s + (e.queueDepth ?? e.queue_depth ?? 0), 0);
  const featured = onSale.slice(0, 3);

  return (
    <div className="flex-grow overflow-x-hidden bg-[#07070f]">

      {/* ════════════════════════════════════════
          01. HERO
      ════════════════════════════════════════ */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col overflow-hidden">

        {/* Video BG */}
        <motion.div className="absolute inset-0" style={{ y: bgY, opacity: heroOpacity }}>
          <VideoCrossfade videos={["/videos/concert1.mp4", "/videos/concert2.mp4"]} interval={10000} />
        </motion.div>

        {/* Additional red haze at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-80 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(225,29,72,0.08), transparent)" }} />

        {/* Subtle noise */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />

        {/* Content */}
        <motion.div style={{ y: textY }}
          className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 md:px-12 text-center pt-28 pb-44">

          {/* Live chip */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7 }}
            className="inline-flex items-center gap-2.5 mb-10 px-5 py-2.5 rounded-full border border-[#e11d48]/25 bg-black/30 backdrop-blur-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e11d48] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e11d48]" />
            </span>
            <span className="font-mono text-[11px] text-[#ffb3b6] tracking-[0.22em] uppercase font-medium">
              {queueTotal > 0 ? `${queueTotal.toLocaleString()} fans in queue` : "System Live — Doors Open"}
            </span>
          </motion.div>

          {/* Main wordmark */}
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
            <h1 className="font-[family-name:var(--font-bebas)] leading-[0.85] select-none mb-8 whitespace-nowrap">
              <span className="text-[clamp(48px,10vw,150px)] text-white"
                style={{ textShadow: "0 0 80px rgba(225,29,72,0.3), 0 2px 0 rgba(0,0,0,0.5)" }}>QUEUE</span><span className="text-[clamp(48px,10vw,150px)]"
                style={{
                  backgroundImage: "linear-gradient(135deg, #ff6b8a 0%, #e11d48 40%, #be0037 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "drop-shadow(0 0 40px rgba(225,29,72,0.5))",
                }}>GATE</span>
            </h1>
          </motion.div>

          {/* Tagline */}
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.7 }}
            className="text-base md:text-lg text-white/55 max-w-md mb-12 leading-relaxed font-light tracking-wide">
            The world's most secure concert ticketing infrastructure. Cryptographic queues. Zero bots.
          </motion.p>

          {/* CTA buttons */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.7 }}
            className="flex flex-col sm:flex-row gap-4 items-center mb-20">
            <motion.button
              whileHover={{ scale: 1.04, boxShadow: "0 0 60px rgba(225,29,72,0.8), 0 0 120px rgba(225,29,72,0.3)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push("/events")}
              className="relative overflow-hidden group flex items-center gap-3 bg-[#e11d48] text-white px-9 py-4 rounded-2xl font-semibold text-sm tracking-wide shadow-[0_0_40px_rgba(225,29,72,0.5)] cursor-pointer"
            >
              <Play size={15} className="fill-white" />
              Enter Lobby
              <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
              {/* shimmer */}
              <motion.span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                animate={{ x: ["-200%", "200%"] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4 }} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03, borderColor: "rgba(255,255,255,0.25)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push("/register")}
              className="flex items-center gap-3 px-9 py-4 rounded-2xl font-semibold text-sm tracking-wide text-white/80 hover:text-white border border-white/[0.12] backdrop-blur-xl bg-white/[0.04] transition-all cursor-pointer">
              Create Account
            </motion.button>
          </motion.div>

          {/* Stats strip */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.7 }}
            className="flex items-center gap-10 md:gap-16 border-t border-white/[0.08] pt-8">
            {[
              { val: 99, suf: ".9%", label: "Uptime" },
              { val: onSale.length, suf: "+", label: "Live Events" },
              { val: 0, suf: "ms", label: "Bot Latency" },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="font-[family-name:var(--font-bebas)] text-3xl md:text-4xl text-white mb-0.5">
                  <Counter to={s.val} suffix={s.suf} />
                </div>
                <div className="font-mono text-[10px] text-white/30 uppercase tracking-widest">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, y: [0, 8, 0] }}
          transition={{ delay: 2, duration: 2, repeat: Infinity }}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 text-white/20">
          <ChevronDown size={18} />
        </motion.div>

        {/* Bottom angled marquee */}
        <motion.div initial={{ opacity: 0, y: 40, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: -2 }}
          transition={{ delay: 0.8, duration: 0.9 }}
          className="absolute bottom-0 left-0 w-[115%] -translate-x-[5%] z-20 overflow-hidden select-none"
          style={{ background: "linear-gradient(90deg, #be0037, #e11d48, #ff3d6b, #e11d48, #be0037)", padding: "14px 0", boxShadow: "0 -8px 50px rgba(225,29,72,0.4)" }}>
          <div className="marquee-content font-[family-name:var(--font-bebas)] text-xl tracking-[0.35em] text-white whitespace-nowrap">
            {[1, 2, 3, 4].map(n => (
              <span key={n} className="inline-block mr-12">
                ✦ EXPERIENCE THE MUSIC &nbsp; ✦ LIVE ON SALE &nbsp; ✦ SECURE YOUR TICKETS &nbsp; ✦ ANTI-BOT PROTECTION ACTIVE &nbsp; ✦ CRYPTOGRAPHIC DELIVERY &nbsp;
              </span>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ════════════════════════════════════════
          02. FEATURED EVENTS
      ════════════════════════════════════════ */}
      <section className="py-32 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#e11d48]/30 to-transparent" />

        <div className="max-w-7xl mx-auto px-6 md:px-12">
          {/* Section header */}
          <div className="flex items-end justify-between mb-14">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <p className="font-mono text-[11px] text-[#e11d48] tracking-[0.3em] uppercase mb-3">{'// On Sale Now'}</p>
              <h2 className="font-[family-name:var(--font-bebas)] text-6xl md:text-7xl text-white tracking-wide leading-none">
                Featured Acts
              </h2>
            </motion.div>
            <motion.button initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
              onClick={() => router.push("/events")}
              className="hidden md:flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors group cursor-pointer">
              All Events <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </motion.button>
          </div>

          {/* Event cards grid */}
          {featured.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {featured.map((ev, i) => (
                <EventCard key={ev.id} event={ev} index={i} onClick={() => router.push(`/events/${ev.id}`)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-[480px] rounded-3xl bg-white/[0.03] animate-pulse border border-white/[0.05]" />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════
          03. TECH / HOW IT WORKS — horizontal scroll
      ════════════════════════════════════════ */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#060910]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        {/* Center ambient */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(225,29,72,0.04) 0%, transparent 60%)" }} />

        <div className="relative max-w-7xl mx-auto px-6 md:px-12">
          <motion.div className="text-center mb-20"
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <p className="font-mono text-[11px] text-[#e11d48] tracking-[0.3em] uppercase mb-4">{'// Built Different'}</p>
            <h2 className="font-[family-name:var(--font-bebas)] text-6xl md:text-8xl text-white tracking-wide">
              WHY QUEUEGATE?
            </h2>
            <div className="mt-4 mx-auto w-24 h-[2px]"
              style={{ background: "linear-gradient(90deg, transparent, #e11d48, transparent)" }} />
          </motion.div>

          {/* Feature grid — 2 large + 2 normal */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard icon={Shield} color="#e11d48" title="Anti-Bot Architecture" wide
              desc="Redis-backed FIFO queue with cryptographic session tokens, layered rate limiting, and IP-level threat scoring. Only real humans reach checkout — scalper scripts die at the edge." />
            <FeatureCard icon={Zap} color="#f59e0b" title="Sub-Second Scaling"
              desc="Kafka feedback loop auto-throttles admission when your checkout degrades. Handles tens of millions of concurrent fans without breaking a sweat." />
            <FeatureCard icon={Ticket} color="#a855f7" title="Verified Delivery"
              desc="Cryptographically signed JWT checkout tokens delivered over WebSocket. Every ticket is immutable and tamper-proof, validated server-side." />
            <FeatureCard icon={Users} color="#06b6d4" title="Stadium Zone Pricing" wide
              desc="Create multi-zone events — VIP Floor, Gold Circle, General Admission — each with their own capacity and price point. Fans see a live stadium map and pick their section. Merchants get granular revenue insight per zone." />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          04. PROCESS — numbered steps
      ════════════════════════════════════════ */}
      <section className="py-32 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#e11d48]/20 to-transparent" />
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <motion.div className="text-center mb-20"
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <p className="font-mono text-[11px] text-[#e11d48] tracking-[0.3em] uppercase mb-4">{'// Simple. Secure. Fast.'}</p>
            <h2 className="font-[family-name:var(--font-bebas)] text-6xl md:text-7xl text-white tracking-wide">HOW IT WORKS</h2>
          </motion.div>

          <div className="relative">
            {/* Connector line */}
            <div className="hidden md:block absolute left-[3.5rem] top-8 bottom-8 w-px bg-gradient-to-b from-[#e11d48]/60 via-[#e11d48]/20 to-transparent" />

            <div className="space-y-8">
              {[
                { n: "01", title: "Join the Queue", desc: "Fan clicks 'Get Tickets'. They're placed into a cryptographically secure FIFO queue — their position is locked the instant they join." },
                { n: "02", title: "Wait Room", desc: "A live waiting room shows their exact position and estimated wait. Our system admits fans in batches calibrated to checkout server capacity." },
                { n: "03", title: "Select Your Zone", desc: "Fan lands on the stadium map and selects their preferred zone — VIP Floor, Gold Circle, General — at the merchant-set price." },
                { n: "04", title: "Checkout & Confirm", desc: "A time-locked signed checkout token is issued. Fan completes purchase. A cryptographic ticket receipt is delivered over WebSocket instantly." },
              ].map((step, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.12, duration: 0.5 }}
                  className="flex gap-6 md:gap-10 group">
                  {/* Number circle */}
                  <div className="flex-shrink-0 w-14 h-14 rounded-full border-2 border-[#e11d48]/40 bg-[#e11d48]/10 flex items-center justify-center z-10
                    group-hover:border-[#e11d48] group-hover:bg-[#e11d48]/20 transition-all">
                    <span className="font-[family-name:var(--font-bebas)] text-xl text-[#e11d48]">{step.n}</span>
                  </div>
                  {/* Content */}
                  <div className="flex-1 pt-2 pb-8 border-b border-white/[0.05] last:border-0">
                    <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-white tracking-wide mb-2">{step.title}</h3>
                    <p className="text-sm text-white/45 leading-relaxed max-w-xl">{step.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          05. SOCIAL PROOF
      ════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#060910]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />

        <div className="relative max-w-7xl mx-auto px-6 md:px-12">
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="font-mono text-[11px] text-center text-[#e11d48] tracking-[0.3em] uppercase mb-14">
            {'// Trusted by operators worldwide'}
          </motion.p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { q: "The only ticketing platform that actually stopped bots at our Taylor Swift show. 70,000 seats — zero scalpers.", name: "Sarah M.", role: "Event Director, WME" },
              { q: "45,000 fans processed in under 3 minutes. Zero crashes, zero chargebacks. Their infrastructure is light years ahead.", name: "James K.", role: "Head of Ops, Venue Group" },
              { q: "VIP zone pricing made our revenue per seat jump 40%. The stadium map UX is genuinely beautiful.", name: "Ana C.", role: "Artist Manager" },
            ].map((t, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.12, duration: 0.6 }}
                className="relative bg-[#0c0f14] rounded-3xl p-8 border border-white/[0.05] overflow-hidden group hover:border-white/[0.1] transition-colors">
                {/* Subtle quote mark */}
                <div className="absolute top-6 right-8 font-serif text-8xl text-white/[0.03] leading-none select-none">"</div>
                <div className="flex gap-0.5 mb-5">
                  {[...Array(5)].map((_, j) => (
                    <svg key={j} viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#f59e0b]">
                      <path d="M8 .992l1.98 4.01 4.43.644-3.205 3.123.756 4.41L8 10.95l-3.962 2.229.756-4.41L1.59 5.646l4.43-.644z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-white/60 leading-relaxed mb-6 italic">"{t.q}"</p>
                <div className="border-t border-white/[0.06] pt-5">
                  <p className="font-semibold text-sm text-white">{t.name}</p>
                  <p className="text-xs text-white/35 mt-0.5">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          06. FINAL CTA
      ════════════════════════════════════════ */}
      <section className="relative py-48 overflow-hidden">
        {/* BG — concert image */}
        <div className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1600&auto=format&fit=crop&q=60')",
            filter: "brightness(0.18) saturate(1.4)",
          }} />
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#07070f] via-transparent to-[#07070f]" />
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(225,29,72,0.12), transparent 70%)" }} />

        <div className="relative z-10 max-w-4xl mx-auto px-6 md:px-12 text-center">
          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <p className="font-mono text-[11px] text-[#e11d48] tracking-[0.3em] uppercase mb-6">{'// The Gates are Open'}</p>
            <h2 className="font-[family-name:var(--font-bebas)] text-7xl sm:text-9xl text-white tracking-wide mb-6 leading-[0.88]"
              style={{ textShadow: "0 0 100px rgba(225,29,72,0.3)" }}>
              JOIN THE<br />QUEUE
            </h2>
            <p className="text-white/40 text-sm mb-14 max-w-sm mx-auto leading-relaxed">
              Fair access at any scale. Real fans only. Cryptographic security from the first click.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/events"
                className="group inline-flex items-center gap-3 bg-[#e11d48] text-white px-12 py-5 rounded-2xl font-semibold text-sm tracking-wide hover:bg-[#be0037] transition-all shadow-[0_0_50px_rgba(225,29,72,0.6)] hover:shadow-[0_0_80px_rgba(225,29,72,0.9)]">
                <Play size={14} className="fill-white" />
                Browse Events
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/register"
                className="inline-flex items-center gap-3 px-12 py-5 rounded-2xl font-semibold text-sm tracking-wide border border-white/[0.12] text-white/70 hover:text-white hover:border-white/25 backdrop-blur-xl bg-white/[0.04] transition-all">
                Sign Up Free
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

    </div>
  );
}
