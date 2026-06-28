"use client";

import { useEffect, useRef } from "react";
import { animate, motion, AnimatePresence } from "framer-motion";

/* ─────────────────────────────────────────────────
   POSITION COUNTER — cinematic rank card
───────────────────────────────────────────────── */
export function PositionCounter({ position }: { position: number }) {
  const nodeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const currentVal = parseInt(node.textContent?.replace(/,/g, "") || "0", 10);
    if (isNaN(currentVal) || currentVal === 0) {
      node.textContent = position.toLocaleString();
      return;
    }
    const controls = animate(currentVal, position, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate(value) {
        if (node) node.textContent = Math.round(value).toLocaleString();
      },
    });
    return () => controls.stop();
  }, [position]);

  return (
    <div className="relative flex flex-col items-center justify-center h-full min-h-[280px] group">
      {/* Glow halo */}
      <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_center,rgba(225,29,72,0.18)_0%,transparent_70%)] pointer-events-none" />

      {/* Rank label */}
      <span className="font-mono text-[11px] text-[#9ca3af] uppercase tracking-[0.22em] mb-3 z-10">
        Your Position
      </span>

      {/* Giant number */}
      <span
        ref={nodeRef}
        className="z-10 font-[family-name:var(--font-bebas)] tabular-nums leading-none select-none"
        style={{
          fontSize: "clamp(72px, 14vw, 130px)",
          background: "linear-gradient(170deg, #ffffff 30%, #e11d48 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          filter: "drop-shadow(0 0 30px rgba(225,29,72,0.45))",
        }}
      >
        {position.toLocaleString()}
      </span>

      {/* Subtitle */}
      <span className="font-mono text-[10px] text-[#6b7280] uppercase tracking-[0.2em] mt-3 z-10">
        in queue ahead of you
      </span>

      {/* Animated bottom rule */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1, delay: 0.3, ease: [0.25, 1, 0.5, 1] }}
        className="absolute bottom-0 inset-x-0 h-[2px] origin-left rounded-full"
        style={{ background: "linear-gradient(90deg, #e11d48, transparent)" }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────
   ETA DISPLAY — waveform bars + radial arc
───────────────────────────────────────────────── */
export function ETADisplay({ etaSeconds }: { etaSeconds: number | null }) {
  if (etaSeconds === null) return null;

  const hrs = Math.floor(etaSeconds / 3600);
  const m   = Math.floor((etaSeconds % 3600) / 60);
  const s   = etaSeconds % 60;

  const maxSeconds = 3 * 60 * 60; // 3-hour visual scale
  const progress = Math.min(Math.max(etaSeconds / maxSeconds, 0), 1);
  const r = 60;
  const circ = 2 * Math.PI * r;
  const strokeDashoffset = circ - progress * circ;

  // Build ETA label
  const etaLabel =
    hrs > 0
      ? `${hrs}h ${m}m`
      : m > 0
      ? `~${m}m ${s.toString().padStart(2, "0")}s`
      : `${s}s`;

  const bars = Array.from({ length: 24 }, (_, i) => {
    const heightFactor = 0.3 + Math.sin(i * 0.85 + progress * 10) * 0.35 + Math.random() * 0.35;
    return Math.max(0.15, Math.min(1, heightFactor));
  });

  return (
    <div className="relative flex flex-col items-center justify-center h-full min-h-[280px]">
      {/* SVG radial arc */}
      <svg
        width="180"
        height="180"
        viewBox="0 0 180 180"
        className="-rotate-90 absolute opacity-60"
      >
        <circle cx="90" cy="90" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="none" />
        <motion.circle
          cx="90"
          cy="90"
          r={r}
          stroke="#facc15"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          style={{
            strokeDasharray: circ,
            filter: "drop-shadow(0 0 8px rgba(250,204,21,0.6))",
          }}
        />
      </svg>

      {/* Centre text */}
      <div className="z-10 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-[0.2em] mb-1">
          Est. Wait
        </span>
        <span
          className="font-[family-name:var(--font-bebas)] leading-none"
          style={{
            fontSize: "clamp(32px, 5vw, 48px)",
            color: "#facc15",
            filter: "drop-shadow(0 0 12px rgba(250,204,21,0.5))",
          }}
        >
          {etaLabel}
        </span>
      </div>

      {/* Waveform bars below */}
      <div className="absolute bottom-4 left-0 right-0 flex items-end justify-center gap-[3px] h-10 px-8">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-full"
            style={{ background: "rgba(250,204,21,0.35)" }}
            animate={{ scaleY: [h, h * 0.5 + 0.1, h] }}
            transition={{
              duration: 1.2 + (i % 5) * 0.2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.06,
            }}
            initial={{ height: "100%", originY: 1 }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   QUEUE VISUALIZER — stadium seats grid
───────────────────────────────────────────────── */
export function QueueVisualizer({ position }: { position: number }) {
  const COLS = 12;
  const ROWS = 8;
  const total = COLS * ROWS;
  const filled = Math.min(position, total - 1);
  const userCell = filled; // user is at the last filled cell

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[280px] w-full">
      <span className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-[0.22em] mb-5">
        The Crowd Ahead
      </span>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
      >
        <AnimatePresence>
          {Array.from({ length: total }).map((_, i) => {
            const isUser = i === userCell;
            const isFilled = i < filled;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{
                  opacity: isUser ? 1 : isFilled ? 0.45 : 0.1,
                  scale: isUser ? 1.4 : 1,
                }}
                transition={{ duration: 0.3, delay: i * 0.003 }}
                className="rounded-sm"
                style={{
                  width: 10,
                  height: 12,
                  background: isUser
                    ? "#e11d48"
                    : isFilled
                    ? "#4b5563"
                    : "rgba(255,255,255,0.08)",
                  boxShadow: isUser ? "0 0 10px #e11d48, 0 0 4px #ff4d6d" : "none",
                }}
              />
            );
          })}
        </AnimatePresence>
      </div>

      <span className="font-mono text-[10px] text-[#6b7280] mt-4">
        {position > total
          ? `${(position - total).toLocaleString()} more behind visible`
          : `${position} ahead of you`}
      </span>
    </div>
  );
}
