import { cn } from '@/lib/utils';

interface GlassBadgeProps {
  variant: 'live' | 'upcoming' | 'ended';
  children: React.ReactNode;
  className?: string;
}

export function GlassBadge({ variant, children, className }: GlassBadgeProps) {
  const baseClasses =
    'inline-flex items-center gap-2 px-3 py-1 text-[10px] font-mono font-semibold rounded uppercase tracking-widest border backdrop-blur-md';

  const variants = {
    live: 'bg-[#e11d48]/10 border-[#e11d48]/20 text-[#ffb3b6] shadow-[0_0_10px_rgba(225,29,72,0.2)]',
    upcoming: 'bg-[#facc15]/10 border-[#facc15]/20 text-[#ffb95f]',
    ended: 'bg-white/[0.03] border-white/[0.08] text-white/40',
  };

  return (
    <div className={cn(baseClasses, variants[variant], className)}>
      {variant === 'live' && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e11d48] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e11d48]" />
        </span>
      )}
      {children}
    </div>
  );
}
