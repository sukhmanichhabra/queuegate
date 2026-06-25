import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import React from 'react';

interface GlassCardProps extends HTMLMotionProps<"div"> {
  className?: string;
  children: React.ReactNode;
  /** When true, renders a crimson top-border accent (used on featured cards) */
  accent?: boolean;
}

export function GlassCard({ className, children, accent, ...props }: GlassCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4, borderColor: 'rgba(255, 179, 182, 0.2)' }}
      className={cn(
        'glass-card p-6 transition-all duration-300',
        'shadow-[0_4px_20px_rgba(0,0,0,0.5)]',
        'hover:shadow-[0_8px_30px_rgba(0,0,0,0.7)]',
        accent && 'border-t-2 border-t-[#e11d48] shadow-[0_4px_24px_rgba(225,29,72,0.15)]',
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
