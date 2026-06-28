"use client";

import { useEffect, useRef } from "react";
import { animate } from "framer-motion";
import { GlassCard } from "../glass/GlassCard";

export function PositionCounter({ position }: { position: number }) {
  const nodeRef = useRef<HTMLHeadingElement>(null);
  
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const currentVal = parseInt(node.textContent || "0", 10);
    if (isNaN(currentVal) || currentVal === 0) {
      node.textContent = position.toString();
      return;
    }

    const controls = animate(currentVal, position, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate(value) {
        node.textContent = Math.round(value).toString();
      },
    });

    return () => controls.stop();
  }, [position]);

  return (
    <GlassCard className="flex flex-col items-center justify-center p-12 min-h-[300px]">
      <div className="text-[var(--text-muted)] text-xl font-medium tracking-wider mb-4 uppercase">
        Your Position
      </div>
      <h1 
        ref={nodeRef}
        className="text-8xl md:text-9xl font-extrabold tabular-nums tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-violet-300 drop-shadow-[0_0_25px_rgba(124,58,237,0.5)]"
      >
        {position}
      </h1>
    </GlassCard>
  );
}
