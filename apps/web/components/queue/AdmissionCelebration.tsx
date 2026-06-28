"use client";

import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { Ticket, Shield, Zap } from "lucide-react";

/* ══════════════════════════════════════════
   SPOTLIGHT BEAM
══════════════════════════════════════════ */
function SpotlightBeam({ angle, color, delay, duration }: {
  angle: number; color: string; delay: number; duration: number;
}) {
  return (
    <motion.div
      className="absolute top-0 left-1/2 origin-top pointer-events-none"
      style={{
        width: 2,
        height: "75vh",
        background: `linear-gradient(to bottom, ${color}99 0%, ${color}22 60%, transparent 100%)`,
        filter: "blur(3px)",
        rotate: angle,
        translateX: "-50%",
      }}
      animate={{ rotate: [angle - 18, angle + 18, angle - 18] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

/* ══════════════════════════════════════════
   CONFETTI PIECE
══════════════════════════════════════════ */
function ConfettiPiece({ delay, x, color, shape }: {
  delay: number; x: number; color: string; shape: "rect" | "circle" | "line";
}) {
  const size = Math.random() * 8 + 4;
  const rot = Math.random() * 720 - 360;
  return (
    <motion.div
      className="absolute top-0 pointer-events-none"
      style={{
        left: `${x}%`,
        width: shape === "line" ? 2 : size,
        height: shape === "line" ? size * 3 : size,
        background: color,
        borderRadius: shape === "circle" ? "50%" : shape === "rect" ? 2 : 1,
      }}
      initial={{ y: -20, opacity: 1, rotate: 0, x: 0 }}
      animate={{
        y: ["0vh", "110vh"],
        opacity: [1, 1, 0],
        rotate: rot,
        x: [0, (Math.random() - 0.5) * 120],
      }}
      transition={{
        duration: 2.5 + Math.random() * 2,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    />
  );
}

/* ══════════════════════════════════════════
   TICKET VISUAL
══════════════════════════════════════════ */
function AnimatedTicket({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0, scale: 0.8, rotateX: 45 }}
          animate={{ y: 0, opacity: 1, scale: 1, rotateX: 0 }}
          transition={{ type: "spring", stiffness: 160, damping: 20, delay: 0.3 }}
          className="relative w-[340px] sm:w-[400px]"
          style={{ perspective: 1000 }}
        >
          {/* Glow */}
          <div
            className="absolute -inset-4 rounded-3xl blur-2xl opacity-60 pointer-events-none"
            style={{ background: "radial-gradient(ellipse, rgba(225,29,72,0.5) 0%, transparent 70%)" }}
          />

          {/* Ticket body */}
          <div
            className="relative rounded-2xl overflow-hidden border border-white/10"
            style={{ background: "linear-gradient(145deg, #1a0d0f 0%, #130508 50%, #0d0508 100%)", boxShadow: "0 30px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.07)" }}
          >
            {/* Top accent */}
            <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, #be0037, #e11d48, #ff6b8a, #e11d48, #be0037)" }} />

            {/* Top section */}
            <div className="px-7 pt-6 pb-5">
              {/* Brand row */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #e11d48, #be0037)" }}
                  >
                    <Ticket size={13} className="text-white" />
                  </div>
                  <span className="font-[family-name:var(--font-bebas)] text-lg text-white tracking-widest">
                    QUEUE<span className="text-[#e11d48]">GATE</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(0,184,124,0.12)", border: "1px solid rgba(0,184,124,0.25)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00b87c] animate-pulse" />
                  <span className="font-mono text-[9px] text-[#00b87c] uppercase tracking-widest">VALID</span>
                </div>
              </div>

              {/* ADMITTED stamp */}
              <motion.div
                initial={{ scale: 2.5, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.6 }}
                className="inline-block mb-4"
              >
                <div
                  className="px-5 py-2 rounded border-4 font-[family-name:var(--font-bebas)] text-3xl tracking-[0.3em]"
                  style={{
                    borderColor: "#00b87c",
                    color: "#00b87c",
                    boxShadow: "0 0 20px rgba(0,184,124,0.3), inset 0 0 20px rgba(0,184,124,0.05)",
                    textShadow: "0 0 20px rgba(0,184,124,0.5)",
                  }}
                >
                  ADMITTED
                </div>
              </motion.div>

              <h2 className="font-[family-name:var(--font-bebas)] text-4xl sm:text-5xl text-white leading-none tracking-wide">
                ACCESS GRANTED
              </h2>
              <p className="font-mono text-xs text-white/35 mt-1 uppercase tracking-widest">
                Cryptographic queue clearance confirmed
              </p>
            </div>

            {/* Tear line */}
            <div className="relative flex items-center mx-0">
              <div className="w-6 h-6 rounded-full -ml-3 flex-shrink-0" style={{ background: "#07070f" }} />
              <div className="flex-1 border-t-2 border-dashed border-white/[0.08]" />
              <div className="w-6 h-6 rounded-full -mr-3 flex-shrink-0" style={{ background: "#07070f" }} />
            </div>

            {/* Bottom section */}
            <div className="px-7 py-5">
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: "Status", value: "CLEARED" },
                  { label: "Layer", value: "VIP" },
                  { label: "Token", value: "ACTIVE" },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="font-mono text-[8px] text-white/25 uppercase tracking-widest mb-1">{item.label}</p>
                    <p className="font-mono text-xs text-white font-bold tracking-wider">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Barcode */}
              <div className="flex items-end gap-[2px] h-10 opacity-25">
                {Array.from({ length: 44 }, (_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-[1px] flex-shrink-0"
                    style={{ width: i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1, height: `${50 + Math.sin(i * 0.9) * 35}%` }}
                  />
                ))}
              </div>
              <p className="font-mono text-[9px] text-white/20 tracking-[0.3em] mt-2">QGATE • CRYPTOGRAPHIC PASS</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
export function AdmissionCelebration() {
  const [ticketVisible, setTicketVisible] = useState(false);
  const [confettiVisible, setConfettiVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const t1 = setTimeout(() => setTicketVisible(true), 100);
    const t2 = setTimeout(() => setConfettiVisible(true), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Progress bar drains over 3 seconds
  useEffect(() => {
    const start = Date.now();
    const duration = 3000;
    const iv = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / duration) * 100);
      setProgress(pct);
      if (pct === 0) clearInterval(iv);
    }, 30);
    return () => clearInterval(iv);
  }, []);

  const CONFETTI_COLORS = ["#e11d48", "#ff4d6d", "#facc15", "#fbbf24", "#a855f7", "#818cf8", "#00b87c", "#34d399", "#fb923c", "#ffffff", "#f9a8d4"];
  const confettiPieces = Array.from({ length: 80 }, (_, i) => ({
    delay: Math.random() * 0.6,
    x: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    shape: (["rect", "circle", "line"] as const)[Math.floor(Math.random() * 3)],
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "#07070f" }}
    >
      {/* ── Background concert atmosphere ── */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-10"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1600&auto=format&fit=crop&q=60')", filter: "saturate(1.5) brightness(0.5)" }}
      />

      {/* ── Deep radial glow ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 60%, rgba(225,29,72,0.15) 0%, transparent 70%)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 40% 30% at 50% 50%, rgba(0,184,124,0.07) 0%, transparent 60%)" }} />

      {/* ── Spotlight beams ── */}
      <SpotlightBeam angle={-30} color="#e11d48" delay={0}   duration={5} />
      <SpotlightBeam angle={-12} color="#a855f7" delay={0.8} duration={4.5} />
      <SpotlightBeam angle={12}  color="#facc15" delay={0.4} duration={5.5} />
      <SpotlightBeam angle={30}  color="#06b6d4" delay={1.2} duration={4} />

      {/* ── Bottom stage glow ── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(225,29,72,0.12), transparent)" }}
      />

      {/* ── Confetti ── */}
      {confettiVisible && confettiPieces.map((p, i) => (
        <ConfettiPiece key={i} {...p} />
      ))}

      {/* ── Central content ── */}
      <div className="relative z-10 flex flex-col items-center text-center px-6">

        {/* Eyebrow label */}
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="font-mono text-[10px] text-[#e11d48] tracking-[0.4em] uppercase mb-5 flex items-center gap-2"
        >
          <Shield size={10} />
          Anti-bot verification complete
          <Shield size={10} />
        </motion.p>

        {/* BIG heading */}
        <motion.h1
          initial={{ opacity: 0, scale: 0.7, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
          className="font-[family-name:var(--font-bebas)] leading-[0.88] tracking-wide select-none mb-6"
          style={{
            fontSize: "clamp(4rem, 13vw, 8rem)",
            backgroundImage: "linear-gradient(135deg, #ffffff 0%, #ffd6db 40%, #e11d48 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 60px rgba(225,29,72,0.7))",
          }}
        >
          YOU'RE IN!
        </motion.h1>

        {/* Animated ticket */}
        <AnimatedTicket visible={ticketVisible} />

        {/* Redirect strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="mt-7 w-full max-w-sm"
        >
          {/* Progress bar */}
          <div className="h-[3px] w-full rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #be0037, #e11d48, #ff6b8a)",
                boxShadow: "0 0 12px rgba(225,29,72,0.9)",
                transitionDuration: "30ms",
                transitionTimingFunction: "linear",
              }}
            />
          </div>

          <div className="flex items-center justify-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            >
              <Zap size={12} className="text-[#facc15]" />
            </motion.div>
            <p className="font-mono text-xs text-white/40 uppercase tracking-widest">
              Redirecting to secure checkout...
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
