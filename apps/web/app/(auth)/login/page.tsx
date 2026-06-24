"use client";

import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import Link from "next/link";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { Eye, EyeOff, ArrowRight, Ticket } from "lucide-react";

/* ── Animated Input ── */
function Field({
  label, id, name, type, placeholder, required, autoComplete,
}: {
  label: string; id: string; name: string; type: string;
  placeholder: string; required?: boolean; autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPass = type === "password";
  const actualType = isPass ? (showPass ? "text" : "password") : type;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-mono text-white/40 uppercase tracking-widest">{label}</label>
      <div className="relative">
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          animate={{
            boxShadow: focused
              ? "0 0 0 1.5px rgba(225,29,72,0.7), 0 0 20px rgba(225,29,72,0.15)"
              : "0 0 0 1px rgba(255,255,255,0.07)",
          }}
          transition={{ duration: 0.2 }}
        />
        <input
          id={id} name={name} type={actualType}
          placeholder={placeholder} required={required} autoComplete={autoComplete}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className="w-full px-4 py-3.5 rounded-xl bg-white/[0.04] text-white text-sm placeholder:text-white/20 outline-none backdrop-blur-sm pr-11"
        />
        {isPass && (
          <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
            {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Spotlight beam ── */
function Beam({ angle, color, delay }: { angle: number; color: string; delay: number }) {
  return (
    <motion.div className="absolute top-0 left-1/2 origin-top pointer-events-none"
      style={{ width: 1.5, height: "60%", background: `linear-gradient(to bottom, ${color}aa, transparent)`, rotate: angle, translateX: "-50%", filter: "blur(2px)" }}
      animate={{ rotate: [angle - 12, angle + 12, angle - 12] }}
      transition={{ duration: 4 + delay, repeat: Infinity, ease: "easeInOut", delay }} />
  );
}

/* ── Barcode decoration ── */
function Barcode() {
  return (
    <div className="flex gap-px items-end h-8 opacity-[0.15]">
      {Array.from({ length: 28 }, (_, i) => (
        <div key={i} className="bg-white rounded-[1px]"
          style={{ width: i % 4 === 0 ? 2.5 : 1, height: `${45 + Math.sin(i * 0.8) * 30}%` }} />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") || "/events";
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;
    try {
      const res = await api.post("/auth/login", { email, password });
      const { accessToken, refreshToken } = res.data;
      const meRes = await api.get("/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
      const { email: userEmail, role } = meRes.data;
      setAuth({ accessToken, refreshToken, email: userEmail, role });

      // Set a lightweight indicator cookie so the Edge middleware can detect
      // authentication without needing localStorage (which isn't available
      // on the server). Expires in 7 days — same lifecycle as the refresh token.
      document.cookie = "qg_logged_in=1; path=/; max-age=604800; SameSite=Lax";

      router.push(returnUrl);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Login failed");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#07070f] flex overflow-hidden">

      {/* ── LEFT PANEL: Concert visual ── */}
      <div className="hidden lg:flex relative flex-1 items-center justify-center overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1522158637959-30385a09e0da?w=1200&auto=format&fit=crop&q=80')",
            filter: "brightness(0.3) saturate(1.5)",
          }} />
        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#07070f]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#07070f]/40 via-transparent to-[#07070f]/60" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 50% at 40% 50%, rgba(225,29,72,0.10), transparent 70%)" }} />

        {/* Spotlight beams */}
        <Beam angle={-25} color="#e11d48" delay={0} />
        <Beam angle={-5}  color="#a855f7" delay={1} />
        <Beam angle={15}  color="#f59e0b" delay={0.5} />
        <Beam angle={35}  color="#06b6d4" delay={1.5} />

        {/* Left panel content */}
        <div className="relative z-10 flex flex-col justify-center items-center text-center p-14 w-full">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8 }} className="max-w-xl">
            <p className="font-mono text-[11px] text-[#e11d48] tracking-[0.3em] uppercase mb-6">// The Gate is Open</p>
            <h2 className="font-[family-name:var(--font-bebas)] text-6xl xl:text-8xl text-white leading-none mb-6"
              style={{ textShadow: "0 0 60px rgba(225,29,72,0.3)" }}>
              FRONT ROW<br />
              <span className="text-[#e11d48]">AWAITS</span>
            </h2>
            <p className="text-white/40 text-base leading-relaxed mx-auto">
              Secure your spot in the queue. Cryptographic anti-bot protection means real fans always win.
            </p>

            {/* Stats */}
            <div className="flex justify-center gap-10 mt-12 pt-10 border-t border-white/[0.07]">
              {[
                { v: "99.9%", l: "Uptime" },
                { v: "0ms", l: "Bot Latency" },
                { v: "∞", l: "Fair Queues" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="font-[family-name:var(--font-bebas)] text-3xl text-white">{s.v}</div>
                  <div className="font-mono text-[10px] text-white/30 uppercase tracking-widest mt-0.5">{s.l}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── RIGHT PANEL: Login form ── */}
      <div className="w-full lg:w-[500px] shrink-0 flex items-center justify-center p-6 md:p-12 relative border-l border-white/[0.05] bg-[#07070f]">
        {/* Subtle glow behind form */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(225,29,72,0.05), transparent 70%)" }} />

        <motion.div className="w-full max-w-sm relative z-10 mx-auto"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>

          {/* Brand */}
          <div className="mb-10">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-8 group">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #e11d48, #be0037)" }}>
                <Ticket size={16} className="text-white" />
              </div>
              <span className="font-[family-name:var(--font-bebas)] text-2xl text-white tracking-wide">
                QUEUE<span className="text-[#e11d48]">GATE</span>
              </span>
            </Link>

            <h1 className="font-[family-name:var(--font-bebas)] text-4xl text-white tracking-wide mb-1">
              Welcome Back
            </h1>
            <p className="text-white/35 text-sm">Sign in to access your tickets and queue status.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Email Address" id="email" name="email" type="email"
              placeholder="you@example.com" required autoComplete="email" />
            <Field label="Password" id="password" name="password" type="password"
              placeholder="••••••••" required autoComplete="current-password" />

            <motion.button
              type="submit" disabled={loading}
              whileHover={{ scale: 1.02, boxShadow: "0 0 40px rgba(225,29,72,0.6)" }}
              whileTap={{ scale: 0.98 }}
              className="w-full relative overflow-hidden flex items-center justify-center gap-2.5 py-4 rounded-xl text-white font-semibold text-sm tracking-wide cursor-pointer mt-2"
              style={{ background: "linear-gradient(135deg, #e11d48 0%, #be0037 100%)", boxShadow: "0 0 25px rgba(225,29,72,0.4)" }}
            >
              {/* shimmer */}
              <motion.span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                animate={{ x: ["-200%", "200%"] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3 }} />
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2">
                    <motion.span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                    Signing in…
                  </motion.span>
                ) : (
                  <motion.span key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2">
                    🎫 Enter the Queue <ArrowRight size={14} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-7">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="font-mono text-[10px] text-white/20 uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/35">
              New to QueueGate?{" "}
              <Link href="/register" className="text-[#e11d48] hover:text-[#ff6b8a] font-semibold transition-colors">
                Create account →
              </Link>
            </p>
            <Barcode />
          </div>

          {/* Bottom rainbow bar */}
          <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
            style={{ background: "linear-gradient(90deg, #e11d48, #a855f7, #f59e0b, #06b6d4, #e11d48)" }} />
        </motion.div>
      </div>
    </main>
  );
}
