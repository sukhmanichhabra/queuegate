"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { Eye, EyeOff, ArrowRight, Ticket, Check, Music, Mic } from "lucide-react";

/* ── Animated Input ── */
function Field({
  label, id, name, type, placeholder, required, autoComplete, onChange,
}: {
  label: string; id: string; name: string; type: string; placeholder: string;
  required?: boolean; autoComplete?: string; onChange?: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPass = type === "password";
  const actualType = isPass ? (showPass ? "text" : "password") : type;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-mono text-white/40 uppercase tracking-widest">{label}</label>
      <div className="relative">
        <motion.div className="absolute inset-0 rounded-xl pointer-events-none"
          animate={{
            boxShadow: focused
              ? "0 0 0 1.5px rgba(225,29,72,0.7), 0 0 20px rgba(225,29,72,0.15)"
              : "0 0 0 1px rgba(255,255,255,0.07)",
          }}
          transition={{ duration: 0.2 }} />
        <input id={id} name={name} type={actualType}
          placeholder={placeholder} required={required} autoComplete={autoComplete}
          onChange={e => onChange?.(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className="w-full px-4 py-3.5 rounded-xl bg-white/[0.04] text-white text-sm placeholder:text-white/20 outline-none backdrop-blur-sm pr-11" />
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

/* ── Password strength meter ── */
function StrengthMeter({ value }: { value: string }) {
  if (!value) return null;
  let s = 0;
  if (value.length >= 8) s++;
  if (/[A-Z]/.test(value)) s++;
  if (/[0-9]/.test(value)) s++;
  if (/[^A-Za-z0-9]/.test(value)) s++;
  const colors = ["#e11d48", "#f97316", "#facc15", "#22c55e"];
  const labels = ["Weak", "Fair", "Good", "Strong"];

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5 pt-0.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <motion.div key={i} className="flex-1 h-0.5 rounded-full"
            animate={{ backgroundColor: i < s ? colors[s - 1] : "rgba(255,255,255,0.08)" }}
            transition={{ duration: 0.3 }} />
        ))}
      </div>
      {s > 0 && <p className="text-[10px] font-mono" style={{ color: colors[s - 1] }}>{labels[s - 1]}</p>}
    </motion.div>
  );
}

/* ── Role selector ── */
function RoleSelector({ role, setRole }: { role: "SHOPPER" | "MERCHANT_ADMIN"; setRole: (r: "SHOPPER" | "MERCHANT_ADMIN") => void }) {
  const opts = [
    { value: "SHOPPER" as const, label: "Fan", subtitle: "Join queues & buy tickets", Icon: Music, color: "#e11d48" },
    { value: "MERCHANT_ADMIN" as const, label: "Organiser", subtitle: "Create & manage events", Icon: Mic, color: "#a855f7" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {opts.map(opt => {
        const active = role === opt.value;
        return (
          <motion.button key={opt.value} type="button" onClick={() => setRole(opt.value)}
            whileTap={{ scale: 0.97 }}
            animate={{
              boxShadow: active
                ? `0 0 0 1.5px ${opt.color}80, 0 0 24px ${opt.color}25`
                : "0 0 0 1px rgba(255,255,255,0.07)",
              background: active ? `${opt.color}10` : "rgba(255,255,255,0.02)",
            }}
            transition={{ duration: 0.2 }}
            className="relative rounded-2xl p-5 text-left overflow-hidden cursor-pointer">
            {/* top accent */}
            {active && (
              <motion.div layoutId="role-bar" className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, transparent, ${opt.color}, transparent)` }} />
            )}
            <opt.Icon size={20} className="mb-3" style={{ color: active ? opt.color : "rgba(255,255,255,0.25)" }} />
            <p className="font-semibold text-sm text-white mb-0.5">{opt.label}</p>
            <p className="text-[11px] text-white/35 leading-tight">{opt.subtitle}</p>
            {active && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: opt.color }}>
                <Check size={11} className="text-white" strokeWidth={3} />
              </motion.div>
            )}
          </motion.button>
        );
      })}
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

/* ── Step indicator ── */
function StepDots({ step }: { step: "role" | "creds" }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      {(["role", "creds"] as const).map((s, i) => {
        const active = step === s;
        const done = i === 0 && step === "creds";
        return (
          <div key={s} className="flex items-center gap-2">
            <motion.div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono border"
              animate={{
                borderColor: active || done ? "rgba(225,29,72,0.7)" : "rgba(255,255,255,0.1)",
                background: done ? "#e11d48" : active ? "rgba(225,29,72,0.15)" : "transparent",
                color: active || done ? "#fff" : "rgba(255,255,255,0.2)",
              }}>
              {done ? <Check size={11} strokeWidth={3} /> : i + 1}
            </motion.div>
            <span className={`text-xs font-mono uppercase tracking-widest ${active || done ? "text-white/50" : "text-white/15"}`}>
              {s === "role" ? "Role" : "Details"}
            </span>
            {i === 0 && (
              <motion.div className="w-8 h-px"
                animate={{ background: done ? "#e11d48" : "rgba(255,255,255,0.08)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<"SHOPPER" | "MERCHANT_ADMIN">("SHOPPER");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"role" | "creds">("role");
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    const pwd = fd.get("password") as string;
    const confirmPassword = fd.get("confirmPassword") as string;
    if (pwd !== confirmPassword) { toast.error("Passwords don't match"); setLoading(false); return; }
    try {
      await api.post("/auth/register", { email, password: pwd, role });
      const res = await api.post("/auth/login", { email, password: pwd });
      const { accessToken, refreshToken } = res.data;
      const meRes = await api.get("/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
      const { email: userEmail, role: userRole } = meRes.data;
      setAuth({ accessToken, refreshToken, email: userEmail, role: userRole });
      toast.success("You're in! 🎉");
      router.push("/events");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Registration failed");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#07070f] flex overflow-hidden">

      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex relative flex-1 items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&auto=format&fit=crop&q=80')",
            filter: "brightness(0.28) saturate(1.5)",
          }} />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#07070f]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#07070f]/50 via-transparent to-[#07070f]/70" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 50% at 40% 50%, rgba(168,85,247,0.10), transparent 70%)" }} />

        <Beam angle={-28} color="#a855f7" delay={0} />
        <Beam angle={-8}  color="#e11d48" delay={0.8} />
        <Beam angle={12}  color="#06b6d4" delay={0.4} />
        <Beam angle={32}  color="#f59e0b" delay={1.2} />

        <div className="relative z-10 flex flex-col justify-center items-center text-center p-14 w-full">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8 }} className="max-w-xl">
            <p className="font-mono text-[11px] text-[#a855f7] tracking-[0.3em] uppercase mb-6">{'// Your Journey Starts Here'}</p>
            <h2 className="font-[family-name:var(--font-bebas)] text-6xl xl:text-8xl text-white leading-none mb-6"
              style={{ textShadow: "0 0 60px rgba(168,85,247,0.3)" }}>
              GET YOUR<br />
              <span className="text-[#a855f7]">TICKET</span>
            </h2>
            <p className="text-white/40 text-base leading-relaxed mx-auto">
              Join thousands of fans who've secured their spots with cryptographic fairness. No scalpers. No bots. Just music.
            </p>
            <div className="flex justify-center gap-10 mt-12 pt-10 border-t border-white/[0.07]">
              {[{ v: "Fair", l: "Queue System" }, { v: "Secure", l: "Checkout" }, { v: "Instant", l: "Delivery" }].map(s => (
                <div key={s.l}>
                  <div className="font-[family-name:var(--font-bebas)] text-3xl text-white">{s.v}</div>
                  <div className="font-mono text-[10px] text-white/30 uppercase tracking-widest mt-0.5">{s.l}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="w-full lg:w-[500px] shrink-0 flex items-center justify-center p-6 md:p-12 relative overflow-y-auto border-l border-white/[0.05] bg-[#07070f]">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(168,85,247,0.05), transparent 70%)" }} />

        <motion.div className="w-full max-w-sm relative z-10 py-8 mx-auto"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>

          {/* Brand */}
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-8 group">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #a855f7, #e11d48)" }}>
                <Ticket size={16} className="text-white" />
              </div>
              <span className="font-[family-name:var(--font-bebas)] text-2xl text-white tracking-wide">
                QUEUE<span className="text-[#a855f7]">GATE</span>
              </span>
            </Link>
            <h1 className="font-[family-name:var(--font-bebas)] text-4xl text-white tracking-wide mb-1">Create Account</h1>
            <p className="text-white/35 text-sm">Claim your spot in the queue. Takes 30 seconds.</p>
          </div>

          {/* Step indicator */}
          <StepDots step={step} />

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {step === "role" ? (
                <motion.div key="role" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }} className="space-y-5">
                  <p className="text-xs font-mono text-white/35 uppercase tracking-widest text-center">I am a…</p>
                  <RoleSelector role={role} setRole={setRole} />
                  <motion.button type="button" onClick={() => setStep("creds")}
                    whileHover={{ scale: 1.02, boxShadow: "0 0 40px rgba(225,29,72,0.5)" }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white font-semibold text-sm tracking-wide cursor-pointer relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg, #e11d48, #be0037)", boxShadow: "0 0 25px rgba(225,29,72,0.4)" }}>
                    <motion.span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                      animate={{ x: ["-200%", "200%"] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3 }} />
                    Continue <ArrowRight size={14} />
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div key="creds" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }} className="space-y-4">
                  <Field label="Email Address" id="email" name="email" type="email"
                    placeholder="you@example.com" required autoComplete="email" />
                  <div className="space-y-2">
                    <Field label="Password" id="password" name="password" type="password"
                      placeholder="Min. 6 characters" required autoComplete="new-password" onChange={setPassword} />
                    <StrengthMeter value={password} />
                  </div>
                  <Field label="Confirm Password" id="confirmPassword" name="confirmPassword" type="password"
                    placeholder="••••••••" required autoComplete="new-password" />

                  <div className="flex gap-3 pt-1">
                    <motion.button type="button" onClick={() => setStep("role")}
                      whileTap={{ scale: 0.97 }}
                      className="flex-none px-5 py-3.5 rounded-xl text-sm font-semibold text-white/40 hover:text-white/70 cursor-pointer transition-colors"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      ← Back
                    </motion.button>
                    <motion.button type="submit" disabled={loading}
                      whileHover={{ scale: 1.02, boxShadow: "0 0 40px rgba(225,29,72,0.5)" }}
                      whileTap={{ scale: 0.98 }}
                      className="flex-1 relative overflow-hidden flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold text-sm tracking-wide cursor-pointer"
                      style={{ background: "linear-gradient(135deg, #e11d48, #be0037)", boxShadow: "0 0 20px rgba(225,29,72,0.35)" }}>
                      <motion.span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                        animate={{ x: ["-200%", "200%"] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3 }} />
                      <AnimatePresence mode="wait">
                        {loading ? (
                          <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                            <motion.span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                              animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                            Creating account…
                          </motion.span>
                        ) : (
                          <motion.span key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                            🎟️ Claim My Spot
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>

          {/* Footer link */}
          <p className="text-sm text-white/35 text-center mt-8">
            Already have an account?{" "}
            <Link href="/login" className="text-[#e11d48] hover:text-[#ff6b8a] font-semibold transition-colors">
              Sign in →
            </Link>
          </p>
        </motion.div>
      </div>
    </main>
  );
}
