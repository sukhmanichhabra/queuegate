"use client";

import { motion } from "framer-motion";
import { GlassCard } from "../glass/GlassCard";

export function ETADisplay({ etaSeconds }: { etaSeconds: number | null }) {
  if (etaSeconds === null) return null;

  const m = Math.floor(etaSeconds / 60);
  const s = etaSeconds % 60;
  
  // Visual approximation: assume 60 minutes is the "max" circle
  const maxSeconds = 60 * 60; 
  const progress = Math.min(Math.max(etaSeconds / maxSeconds, 0), 1);
  const circumference = 2 * Math.PI * 45; // r=45
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <GlassCard className="flex items-center justify-center p-8 h-full">
      <div className="relative flex items-center justify-center w-full h-full min-h-[200px]">
        {/* Background track */}
        <svg className="w-48 h-48 -rotate-90 absolute">
          <circle
            cx="96"
            cy="96"
            r="45"
            stroke="var(--glass-border)"
            strokeWidth="8"
            fill="none"
          />
          {/* Animated shrinking arc */}
          <motion.circle
            cx="96"
            cy="96"
            r="45"
            stroke="var(--accent-secondary)"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeInOut" }}
            style={{
              strokeDasharray: circumference,
              filter: "drop-shadow(0 0 8px rgba(6, 182, 212, 0.5))"
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <span className="text-[var(--text-muted)] text-sm mb-1 uppercase tracking-widest">Est. Wait</span>
          <span className="text-3xl font-bold font-mono">
            ~{m}m {s}s
          </span>
        </div>
      </div>
    </GlassCard>
  );
}
