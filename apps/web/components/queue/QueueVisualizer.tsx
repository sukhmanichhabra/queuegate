"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "../glass/GlassCard";

export function QueueVisualizer({ position }: { position: number }) {
  // Generate up to 100 dots based on position.
  const displayCount = Math.min(position, 100);
  const dots = Array.from({ length: displayCount }, (_, i) => position - displayCount + i + 1);

  return (
    <GlassCard className="p-8 h-full flex flex-col justify-center">
      <div className="text-[var(--text-muted)] text-sm uppercase tracking-widest mb-6 text-center">
        The Crowd Ahead
      </div>
      <div className="flex flex-wrap justify-center gap-2 md:gap-3 max-w-sm mx-auto">
        <AnimatePresence>
          {dots.map((dotPos, i) => {
            const isUser = i === dots.length - 1;
            return (
              <motion.div
                key={dotPos}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: isUser ? 1 : 0.2, scale: 1 }}
                exit={{ opacity: 0, scale: 0, transition: { duration: 0.5 } }}
                className={`w-3 h-3 md:w-4 md:h-4 rounded-full ${
                  isUser 
                    ? "bg-[var(--accent-primary)] shadow-[0_0_10px_rgba(124,58,237,0.8)] animate-pulse" 
                    : "bg-white"
                }`}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}
