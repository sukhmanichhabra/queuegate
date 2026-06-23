"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

type NavLink = { label: string; href: string };

const NAV_LINKS: Record<string, NavLink[]> = {
  SHOPPER: [
    { label: "Events", href: "/events" },
    { label: "My Tickets", href: "/tickets" }
  ],
  MERCHANT_ADMIN: [
    { label: "Dashboard", href: "/merchant/dashboard" },
    { label: "My Events", href: "/merchant/events" },
  ],
  OPS_ADMIN: [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "All Events", href: "/admin/events" },
  ],
};

// Pages where the nav should NOT show (auth screens)
const HIDDEN_ON = ["/login", "/register"];

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { email, role, hydrate, clearAuth } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Don't render on auth pages
  if (HIDDEN_ON.includes(pathname)) return null;

  const links = (role ? NAV_LINKS[role] : NAV_LINKS["SHOPPER"]) ?? [];

  const handleSignOut = async () => {
    // Best-effort: call backend revocation so the Phase 14 blocklist is populated.
    // If the API call fails for any reason, proceed with local clear anyway —
    // stranding the user on a failed logout is worse than a missed blocklist write.
    try {
      const { api } = await import('@/lib/api');
      // Tokens live in both the store and localStorage; read both to maximise coverage.
      const storedRefresh = typeof window !== 'undefined'
        ? localStorage.getItem('refreshToken')
        : null;
      const storedAccess = typeof window !== 'undefined'
        ? localStorage.getItem('accessToken')
        : null;

      const refreshToken = storedRefresh;
      const accessToken  = storedAccess;

      if (refreshToken) {
        await api.post('/auth/logout', {
          refreshToken,
          ...(accessToken ? { accessToken } : {}),
        });
      }
    } catch (err) {
      console.warn('[NavBar] Backend logout call failed — clearing local session anyway:', err);
    }
    clearAuth();
    router.push('/login');
  };

  const isDashboard =
    pathname.startsWith("/merchant/dashboard") ||
    pathname.startsWith("/admin/dashboard");

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-4 md:px-8 gap-6 border-b border-white/[0.05] bg-[#0f1417]/80 backdrop-blur-xl">
      {/* Logo */}
      <Link href="/" className="shrink-0 flex items-center gap-3">
        <span className="font-[family-name:var(--font-bebas)] text-2xl tracking-widest text-[#ffb3b6] hover:text-[#e11d48] transition-colors neon-text-glow">
          QUEUEGATE
        </span>
      </Link>

      {/* Live badge — visible on non-dashboard pages */}
      {!isDashboard && (
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-[#1b2023] rounded-full border border-white/[0.05]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e11d48] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e11d48]" />
          </span>
          <span className="font-mono text-[10px] text-[#e11d48] tracking-widest uppercase font-semibold">
            LIVE
          </span>
        </div>
      )}

      {/* Dashboard badge */}
      {isDashboard && (
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-[#1b2023] rounded-full border border-white/[0.05]">
          <Activity size={12} className="text-[#ffb95f] animate-pulse" />
          <span className="font-mono text-[10px] text-[#ffb95f] tracking-widest uppercase font-semibold">
            LIVE MONITOR
          </span>
        </div>
      )}

      {/* Center Links */}
      <div className="flex-1 flex justify-center gap-8">
        {links.map((link) => {
          const isActive = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative font-mono text-xs tracking-widest uppercase pb-1 transition-colors",
                isActive
                  ? "text-[#ffb3b6] font-semibold"
                  : "text-[#9ca3af] hover:text-[#ffb3b6]"
              )}
            >
              {link.label}
              {isActive && (
                <motion.div
                  layoutId="nav-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#e11d48] rounded-full"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </div>

      {/* Right: email + sign out OR login/register */}
      <div className="flex items-center gap-4 shrink-0">
        {!email ? (
          <>
            <Link
              href="/login"
              className="font-mono text-[10px] px-3 py-1.5 h-auto text-[#9ca3af] hover:text-[#ffb3b6] rounded uppercase tracking-widest transition-all"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="font-mono text-[10px] px-3 py-1.5 h-auto bg-[#e11d48]/10 border border-[#e11d48]/30 hover:bg-[#e11d48]/20 hover:text-[#ffb3b6] text-[#e11d48] rounded uppercase tracking-widest transition-all"
            >
              Register
            </Link>
          </>
        ) : (
          <>
            <span className="hidden sm:block font-mono text-[10px] text-[#9ca3af] truncate max-w-[140px] uppercase tracking-wider">
              {email}
            </span>
            <button
              onClick={handleSignOut}
              className="font-mono text-[10px] px-3 py-1.5 h-auto bg-white/[0.04] border border-white/[0.08] hover:bg-[#e11d48]/10 hover:border-[#e11d48]/30 hover:text-[#ffb3b6] text-[#9ca3af] rounded uppercase tracking-widest transition-all cursor-pointer"
            >
              Sign Out
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
