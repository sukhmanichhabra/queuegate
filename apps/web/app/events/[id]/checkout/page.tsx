"use client";

/**
 * Checkout Page — FIFO Queue-Based General Admission
 *
 * Flow:
 *   1. User arrives ADMITTED via WS queue:admitted event
 *   2. checkoutToken + expiresAt + entryId stored in Zustand + localStorage
 *   3. User fills in payment form (card, expiry, CVV, name) — validated client-side
 *   4. "Complete Purchase" → POST /mock-checkout/complete/:entryId
 *        body: { eventId, checkoutToken }
 *   5. Success → receipt modal, then redirect to /events
 *
 * NOTE: Backend mock-checkout does not validate payment card details — validation is client-side only.
 * NOTE: OPS_ADMIN failure injection HUD at bottom — calls real POST /mock-checkout/inject-failure.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useQueueStore } from "@/stores/queue-store";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import {
  Lock, Timer, ArrowLeft, ShieldAlert, CheckCircle, Printer,
  Shield, Zap, Ticket, ChevronRight, CreditCard, Eye, EyeOff,
} from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";

/* ══════════════════════════════════════════
   CARD TYPE DETECTION
══════════════════════════════════════════ */
function detectCardType(num: string): "visa" | "mastercard" | "amex" | "discover" | null {
  const n = num.replace(/\s/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^5[1-5]|^2[2-7]/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^6(?:011|5)/.test(n)) return "discover";
  return null;
}

const CARD_LOGOS: Record<string, string> = {
  visa:       "VISA",
  mastercard: "MC",
  amex:       "AMEX",
  discover:   "DISC",
};

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return digits;
}

/* ══════════════════════════════════════════
   PAYMENT FORM
══════════════════════════════════════════ */
type PaymentData = {
  cardNumber: string;
  expiry: string;
  cvv: string;
  name: string;
};

type PaymentErrors = Partial<Record<keyof PaymentData, string>>;

function validatePayment(data: PaymentData): PaymentErrors {
  const errors: PaymentErrors = {};
  const digits = data.cardNumber.replace(/\s/g, "");
  if (digits.length < 13) errors.cardNumber = "Invalid card number";
  const [mm, yy] = data.expiry.split("/");
  const month = parseInt(mm, 10);
  const year = 2000 + parseInt(yy || "0", 10);
  const now = new Date();
  if (!mm || !yy || isNaN(month) || month < 1 || month > 12 ||
      new Date(year, month - 1) < new Date(now.getFullYear(), now.getMonth()))
    errors.expiry = "Invalid or expired date";
  if (data.cvv.length < 3) errors.cvv = "Invalid CVV";
  if (!data.name.trim() || data.name.trim().split(" ").length < 2) errors.name = "Enter full name";
  return errors;
}

function PaymentForm({
  data, onChange, errors, showCvv, onToggleCvv,
}: {
  data: PaymentData;
  onChange: (field: keyof PaymentData, value: string) => void;
  errors: PaymentErrors;
  showCvv: boolean;
  onToggleCvv: () => void;
}) {
  const cardType = detectCardType(data.cardNumber);
  const inputClass = "w-full bg-transparent font-mono text-sm text-white outline-none placeholder-white/20 tracking-wider";
  const fieldBase = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "12px 14px",
  };
  const fieldError = { borderColor: "rgba(225,29,72,0.5)", background: "rgba(225,29,72,0.04)" };

  return (
    <div className="flex flex-col gap-3">
      {/* Card preview strip */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative h-12 rounded-xl overflow-hidden flex items-center justify-between px-4"
        style={{ background: "linear-gradient(135deg, #1e0b12 0%, #150810 100%)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2">
          <CreditCard size={14} className="text-[#e11d48]/60" />
          <span className="font-mono text-[10px] text-white/20 uppercase tracking-widest">Payment details</span>
        </div>
        {cardType ? (
          <span className="font-[family-name:var(--font-bebas)] text-sm tracking-widest"
            style={{ color: cardType === "visa" ? "#1a6fff" : cardType === "mastercard" ? "#eb001b" : cardType === "amex" ? "#00a8e0" : "#ff6600" }}>
            {CARD_LOGOS[cardType]}
          </span>
        ) : (
          <div className="flex gap-1.5">
            {["#6b7280","#9ca3af","#6b7280"].map((c,i) => (
              <div key={i} className="w-6 h-4 rounded-sm opacity-30" style={{ background: c }} />
            ))}
          </div>
        )}
      </motion.div>

      {/* Cardholder name */}
      <div>
        <label className="font-mono text-[9px] text-white/30 uppercase tracking-[0.2em] block mb-1.5">Cardholder Name</label>
        <div style={{ ...fieldBase, ...(errors.name ? fieldError : {}) }}>
          <input
            className={inputClass}
            placeholder="John Doe"
            value={data.name}
            onChange={e => onChange("name", e.target.value)}
            autoComplete="cc-name"
          />
        </div>
        {errors.name && <p className="font-mono text-[9px] text-[#ff6b8a] mt-1">{errors.name}</p>}
      </div>

      {/* Card number */}
      <div>
        <label className="font-mono text-[9px] text-white/30 uppercase tracking-[0.2em] block mb-1.5">Card Number</label>
        <div style={{ ...fieldBase, ...(errors.cardNumber ? fieldError : {}) }}>
          <input
            className={inputClass}
            placeholder="0000 0000 0000 0000"
            value={data.cardNumber}
            onChange={e => onChange("cardNumber", formatCardNumber(e.target.value))}
            inputMode="numeric"
            autoComplete="cc-number"
            maxLength={19}
          />
        </div>
        {errors.cardNumber && <p className="font-mono text-[9px] text-[#ff6b8a] mt-1">{errors.cardNumber}</p>}
      </div>

      {/* Expiry + CVV row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="font-mono text-[9px] text-white/30 uppercase tracking-[0.2em] block mb-1.5">Expiry</label>
          <div style={{ ...fieldBase, ...(errors.expiry ? fieldError : {}) }}>
            <input
              className={inputClass}
              placeholder="MM/YY"
              value={data.expiry}
              onChange={e => onChange("expiry", formatExpiry(e.target.value))}
              inputMode="numeric"
              autoComplete="cc-exp"
              maxLength={5}
            />
          </div>
          {errors.expiry && <p className="font-mono text-[9px] text-[#ff6b8a] mt-1">{errors.expiry}</p>}
        </div>
        <div>
          <label className="font-mono text-[9px] text-white/30 uppercase tracking-[0.2em] block mb-1.5">CVV</label>
          <div style={{ ...fieldBase, ...(errors.cvv ? fieldError : {}) }} className="flex items-center gap-2">
            <input
              className={inputClass}
              placeholder="•••"
              value={data.cvv}
              type={showCvv ? "text" : "password"}
              onChange={e => onChange("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="cc-csc"
              maxLength={4}
            />
            <button type="button" onClick={onToggleCvv} className="text-white/20 hover:text-white/50 transition-colors cursor-pointer flex-shrink-0">
              {showCvv ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          {errors.cvv && <p className="font-mono text-[9px] text-[#ff6b8a] mt-1">{errors.cvv}</p>}
        </div>
      </div>

      {/* Security note */}
      <div className="flex items-center gap-1.5 mt-1">
        <Shield size={9} className="text-[#00b87c]" />
        <span className="font-mono text-[8px] text-white/20 uppercase tracking-wider">256-bit encrypted · PCI DSS compliant</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   COUNTDOWN HOOK
══════════════════════════════════════════ */
function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number>(0);
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(diff);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);
  return remaining;
}

const pad = (n: number) => n.toString().padStart(2, "0");

/* ══════════════════════════════════════════
   RECEIPT MODAL
══════════════════════════════════════════ */
function ReceiptModal({
  open, ticketRef, eventTitle, categoryName, categoryColor, onClose,
}: {
  open: boolean; ticketRef: string; eventTitle: string;
  categoryName: string | null; categoryColor: string | null; onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[100] p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            className="relative max-w-sm w-full overflow-hidden rounded-2xl"
            style={{
              background: "linear-gradient(160deg, #131017 0%, #0d0b12 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 40px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,184,124,0.1)",
            }}
          >
            <div className="h-[3px]" style={{ background: "linear-gradient(90deg, #065f46, #00b87c, #34d399, #00b87c, #065f46)" }} />
            <div className="p-7 flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                className="relative mb-5"
              >
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(0,184,124,0.12)", border: "2px solid rgba(0,184,124,0.35)", boxShadow: "0 0 30px rgba(0,184,124,0.25)" }}>
                  <CheckCircle className="text-[#00b87c]" size={30} />
                </div>
              </motion.div>
              <p className="font-mono text-[9px] text-[#00b87c] tracking-[0.3em] uppercase mb-1">{'// Purchase Confirmed'}</p>
              <h3 className="font-[family-name:var(--font-bebas)] text-4xl text-white tracking-wide mb-1">TICKETS SECURED</h3>
              <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-5">Cryptographic signature validated</p>
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="w-full bg-white rounded-xl p-4 mb-4"
              >
                <div className="h-12 flex items-center justify-center gap-[2.5px] mb-2">
                  {[2,1,3,1,4,2,1,2,4,1,3,2,1,4,1,2,3,1,4,2,1,3,1,2,1,4].map((w, i) => (
                    <div key={i} className="bg-black h-10 rounded-[1px]" style={{ width: `${w * 1.4}px` }} />
                  ))}
                </div>
                <p className="font-mono text-[10px] text-black tracking-[0.2em] font-bold">{ticketRef}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                className="w-full rounded-xl p-4 mb-5 text-left"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                {[
                  { label: "Event", value: eventTitle },
                  { label: "Zone", value: categoryName || "General Admission", color: categoryColor },
                  { label: "Reference", value: ticketRef, color: "#ffb95f" },
                  { label: "Status", value: "CONFIRMED", color: "#00b87c" },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-2 border-b border-white/[0.04] last:border-0">
                    <span className="font-mono text-[9px] text-white/30 uppercase tracking-widest">{row.label}</span>
                    <span className="font-mono text-[11px] font-bold" style={{ color: row.color || "white" }}>{row.value}</span>
                  </div>
                ))}
              </motion.div>
              <div className="flex gap-3 w-full">
                <button onClick={onClose}
                  className="flex-1 py-3 rounded-xl font-mono text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#dfe3e7" }}>
                  Return
                </button>
                <button onClick={() => window.print()}
                  className="flex-1 py-3 rounded-xl font-mono text-[10px] uppercase tracking-widest text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  style={{ background: "linear-gradient(135deg, #e11d48, #be0037)", boxShadow: "0 0 20px rgba(225,29,72,0.4)" }}>
                  <Printer size={12} /> Print Pass
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ══════════════════════════════════════════
   EXPIRED OVERLAY
══════════════════════════════════════════ */
function ExpiredOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md"
      style={{ background: "rgba(7,7,15,0.92)" }}
    >
      <div className="relative max-w-sm w-full mx-4 rounded-2xl overflow-hidden"
        style={{ background: "linear-gradient(160deg, #1a0508 0%, #0d0407 100%)", border: "1px solid rgba(225,29,72,0.2)", boxShadow: "0 0 80px rgba(225,29,72,0.15)" }}>
        <div className="h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #e11d48, transparent)" }} />
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.25)" }}>
            <Timer size={28} className="text-[#e11d48]" />
          </div>
          <p className="font-mono text-[9px] text-[#e11d48]/60 tracking-[0.3em] uppercase mb-2">{'// Session Expired'}</p>
          <h2 className="font-[family-name:var(--font-bebas)] text-5xl text-white tracking-wide mb-2">TIME'S UP</h2>
          <p className="font-mono text-[11px] text-white/30 uppercase tracking-widest leading-relaxed mb-7">
            Your checkout window has closed.<br />Your spot was released back to the queue.
          </p>
          <button onClick={onDismiss}
            className="w-full py-4 rounded-xl font-[family-name:var(--font-bebas)] text-xl tracking-widest text-white cursor-pointer"
            style={{ background: "linear-gradient(135deg, #e11d48, #be0037)", boxShadow: "0 0 30px rgba(225,29,72,0.4)" }}>
            Browse Events
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════ */
export default function CheckoutPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { isReady: isAuthReady } = useAuthGuard();
  const eventId = params.id;
  const { checkoutToken, expiresAt, entryId, categoryName, categoryPrice, categoryColor, reset } = useQueueStore();
  const { role, hydrate: hydrateAuth } = useAuthStore();

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [failureActive, setFailureActive] = useState(false);
  const [injectingFailure, setInjectingFailure] = useState(false);

  // Payment form state
  const [payment, setPayment] = useState<PaymentData>({ cardNumber: "", expiry: "", cvv: "", name: "" });
  const [paymentErrors, setPaymentErrors] = useState<PaymentErrors>({});
  const [showCvv, setShowCvv] = useState(false);
  const [processingStep, setProcessingStep] = useState<string | null>(null);

  const handlePaymentChange = (field: keyof PaymentData, value: string) => {
    setPayment(p => ({ ...p, [field]: value }));
    if (paymentErrors[field]) setPaymentErrors(e => ({ ...e, [field]: undefined }));
  };

  useEffect(() => { hydrateAuth(); }, [hydrateAuth]);

  const [hydratedToken, setHydratedToken] = useState<string | null>(null);
  const [hydratedExpiresAt, setHydratedExpiresAt] = useState<string | null>(null);
  const [hydratedEntryId, setHydratedEntryId] = useState<string | null>(null);
  const [hydratedCategoryName, setHydratedCategoryName] = useState<string | null>(null);
  const [hydratedCategoryPrice, setHydratedCategoryPrice] = useState<number | null>(null);
  const [hydratedCategoryColor, setHydratedCategoryColor] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const lsToken    = localStorage.getItem("queuegate_checkout_token");
    const lsExpires  = localStorage.getItem("queuegate_expires_at");
    const lsEntryId  = localStorage.getItem("queuegate_entry_id");
    const lsCatName  = localStorage.getItem("queuegate_category_name");
    const lsCatPrice = localStorage.getItem("queuegate_category_price");
    const lsCatColor = localStorage.getItem("queuegate_category_color");
    setHydratedToken(checkoutToken ?? lsToken);
    setHydratedExpiresAt(expiresAt ?? lsExpires);
    setHydratedEntryId(entryId ?? lsEntryId);
    setHydratedCategoryName(categoryName ?? lsCatName);
    setHydratedCategoryPrice(categoryPrice ?? (lsCatPrice ? Number(lsCatPrice) : null));
    setHydratedCategoryColor(categoryColor ?? lsCatColor);
    setIsReady(true);
  }, [checkoutToken, expiresAt, entryId, categoryName, categoryPrice, categoryColor]);

  useEffect(() => {
    console.log("[CheckoutPage] isReady:", isReady, "hydratedToken:", hydratedToken);
    if (isReady && !hydratedToken) {
      console.log("[CheckoutPage] Redirecting to event page because no token!");
      router.replace(`/events/${eventId}`);
    }
  }, [isReady, hydratedToken, eventId, router]);

  const seconds = useCountdown(hydratedExpiresAt);
  const hasStartedRef = useRef(false);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (seconds > 0) hasStartedRef.current = true;
    if (hasStartedRef.current && seconds <= 0) setExpired(true);
  }, [seconds]);

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => { const res = await api.get(`/events/${eventId}`); return res.data; },
    enabled: !!eventId,
  });

  const isOpsAdmin = role === "OPS_ADMIN" ||
    (typeof window !== "undefined" && localStorage.getItem("userRole") === "OPS_ADMIN");

  const handleCompletePurchase = useCallback(async () => {
    // Validate payment form first
    const errors = validatePayment(payment);
    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      return;
    }
    if (!hydratedEntryId) { toast.error("Missing entry reference."); return; }

    setSubmitting(true);
    setErrorMessage("");

    // Simulate payment processing steps
    const steps = [
      "Encrypting card data...",
      "Contacting payment gateway...",
      "Verifying cryptographic token...",
      "Completing transaction...",
    ];
    for (const step of steps) {
      setProcessingStep(step);
      await new Promise(r => setTimeout(r, 600));
    }
    setProcessingStep(null);

    try {
      await api.post(`/mock-checkout/complete/${hydratedEntryId}`, { eventId, checkoutToken: hydratedToken });
      setSuccess(true);
      setIsReceiptOpen(true);
      setTimeout(() => { reset(); router.push("/events"); }, 5000);
    } catch (err: any) {
      if (err.response?.status === 503) {
        setErrorMessage("TRANSACTION REFUSED: CHECKOUT SERVICE UNAVAILABLE (503)");
      } else {
        setErrorMessage(err.response?.data?.message?.toUpperCase() || "TRANSACTION REFUSED: UNKNOWN ERROR");
      }
      setSubmitting(false);
    }
  }, [payment, hydratedEntryId, eventId, hydratedToken, reset, router]);

  const handleInjectFailure = async (inject: boolean) => {
    setInjectingFailure(true);
    try {
      await api.post(inject ? "/mock-checkout/inject-failure" : "/mock-checkout/clear-failure", { eventId });
      setFailureActive(inject);
      toast.success(inject ? "Payment failure injected via backend." : "Failure cleared — gateway restored.");
    } catch { toast.error("Failed to toggle failure state. Check OPS_ADMIN auth."); }
    setInjectingFailure(false);
  };

  if (!isAuthReady) return null;
  if (!isReady || !hydratedToken) return null;

  const timeDisplay = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  const ticketRef = hydratedEntryId ? `QGATE-${hydratedEntryId.slice(0, 8).toUpperCase()}` : "QGATE-UNKNOWN";
  const ticketPrice = hydratedCategoryPrice ?? event?.ticket_price ?? 0;
  const total = ticketPrice + 4.5;
  const isUrgent = seconds < 60 && seconds > 0;
  const timerColor = seconds < 60 ? "#ffb3b6" : seconds < 120 ? "#ffb95f" : "#e11d48";

  return (
    <div className="flex-grow bg-[#07070f]">
      <div className="noise-overlay" />

      {/* Subtle ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-0 w-96 h-96 rounded-full blur-3xl opacity-[0.05]"
          style={{ background: "#e11d48" }} />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 rounded-full blur-3xl opacity-[0.04]"
          style={{ background: "#a855f7" }} />
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {expired && !success && (
          <ExpiredOverlay onDismiss={() => { reset(); router.push("/events"); }} />
        )}
      </AnimatePresence>

      <ReceiptModal
        open={isReceiptOpen && success}
        ticketRef={ticketRef}
        eventTitle={event?.title ?? `Event #${eventId.slice(0, 8)}`}
        categoryName={hydratedCategoryName}
        categoryColor={hydratedCategoryColor}
        onClose={() => { setIsReceiptOpen(false); reset(); router.push("/events"); }}
      />

      {/* ── Top nav bar ── */}
      <div className="w-full border-b border-white/[0.05] h-14 flex items-center justify-between px-6 md:px-12 sticky top-0 z-20"
        style={{ background: "rgba(7,7,15,0.95)", backdropFilter: "blur(20px)" }}>
        <button
          onClick={() => router.push(`/events/${eventId}`)}
          className="flex items-center gap-2 text-white/40 hover:text-white transition-colors cursor-pointer group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          <span className="font-mono text-[10px] uppercase tracking-widest">Back to Event</span>
        </button>

        {/* Timer pill */}
        <motion.div
          animate={isUrgent ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={{ duration: 0.8, repeat: isUrgent ? Infinity : 0 }}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full"
          style={{
            background: isUrgent ? "rgba(225,29,72,0.12)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${isUrgent ? "rgba(225,29,72,0.4)" : "rgba(255,255,255,0.08)"}`,
          }}
        >
          <Timer size={12} style={{ color: timerColor }} className={isUrgent ? "animate-pulse" : ""} />
          <span className="font-mono text-sm font-bold tracking-widest" style={{ color: timerColor }}>
            {expired ? "00:00" : timeDisplay}
          </span>
        </motion.div>
      </div>

      {/* ── Main two-column layout ── */}
      <div className="px-6 md:px-12 w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 pt-8 pb-28 min-h-[calc(100vh-8rem)]">

        {/* ══ LEFT — Full-height confirmation panel ══ */}
        <section className="flex-grow flex flex-col">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-grow flex flex-col items-center justify-center relative overflow-hidden rounded-2xl"
            style={{
              background: "linear-gradient(160deg, #110d16 0%, #0c0910 50%, #08070d 100%)",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              minHeight: 480,
            }}
          >
            {/* Top accent line */}
            <div className="absolute top-0 inset-x-0 h-[2px]"
              style={{ background: "linear-gradient(90deg, transparent, #e11d48 30%, #ff6b8a 50%, #e11d48 70%, transparent)" }} />

            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(225,29,72,0.07) 0%, transparent 70%)" }} />

            {/* Subtle scan line */}
            <motion.div
              className="absolute inset-x-0 h-[1px] pointer-events-none"
              style={{ background: "linear-gradient(90deg, transparent, rgba(225,29,72,0.3), transparent)" }}
              animate={{ top: ["0%", "100%"] }}
              transition={{ duration: 5, repeat: Infinity, ease: "linear", repeatType: "loop" }}
            />

            <div className="relative z-10 flex flex-col items-center text-center px-8 py-14 max-w-lg mx-auto">

              {/* Icon */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.2 }}
                className="relative mb-8"
              >
                {/* outer pulse ring */}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{ scale: [1, 1.6], opacity: [0.3, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
                  style={{ background: "rgba(225,29,72,0.25)" }}
                />
                <div className="w-24 h-24 rounded-full flex items-center justify-center relative"
                  style={{
                    background: "linear-gradient(135deg, rgba(225,29,72,0.15), rgba(225,29,72,0.05))",
                    border: "1px solid rgba(225,29,72,0.3)",
                    boxShadow: "0 0 40px rgba(225,29,72,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
                  }}>
                  <Lock size={36} className="text-[#e11d48]" style={{ filter: "drop-shadow(0 0 10px rgba(225,29,72,0.6))" }} />
                </div>
              </motion.div>

              {/* Heading */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5 }}
              >
                <p className="font-mono text-[10px] text-[#e11d48]/70 tracking-[0.35em] uppercase mb-3">
                  {'// Queue Clearance Granted'}
                </p>
                <h1 className="font-[family-name:var(--font-bebas)] text-5xl sm:text-6xl text-white tracking-wide leading-none mb-2"
                  style={{ textShadow: "0 0 40px rgba(225,29,72,0.3)" }}>
                  YOU'VE BEEN<br />
                  <span style={{
                    backgroundImage: "linear-gradient(135deg, #ff6b8a 0%, #e11d48 60%, #be0037 100%)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  }}>
                    ADMITTED
                  </span>
                </h1>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="font-mono text-[11px] text-white/30 uppercase tracking-widest leading-relaxed mt-3 mb-8 max-w-xs"
              >
                Your position in the queue was verified. Complete your purchase before the timer expires.
              </motion.p>

              {/* Reference box */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="w-full rounded-xl p-4 mb-6 flex flex-col items-center gap-1.5"
                style={{ background: "rgba(255,185,95,0.05)", border: "1px solid rgba(255,185,95,0.15)" }}
              >
                <span className="font-mono text-[9px] text-white/25 uppercase tracking-[0.25em]">Admission Reference</span>
                <span className="font-mono text-base text-[#ffb95f] font-bold tracking-[0.15em]">{ticketRef}</span>
              </motion.div>

              {/* Info grid */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.62 }}
                className="grid grid-cols-3 gap-3 w-full"
              >
                {[
                  { label: "Type", value: hydratedCategoryName || "General Admission" },
                  { label: "Method", value: "FIFO Queue" },
                  { label: "Verified", value: "✓ Yes", color: "#00b87c" },
                ].map(item => (
                  <div key={item.label} className="rounded-xl p-3 text-center"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="font-mono text-[8px] text-white/25 uppercase tracking-widest mb-1">{item.label}</p>
                    <p className="font-mono text-[10px] font-bold leading-tight" style={{ color: item.color || "white" }}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </motion.div>

              {/* Security badges */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.75 }}
                className="flex flex-wrap justify-center gap-2 mt-6"
              >
                {[
                  { icon: Shield, label: "Anti-bot verified", color: "#00b87c" },
                  { icon: Zap, label: "Crypto token active", color: "#facc15" },
                  { icon: Ticket, label: "FIFO position locked", color: "#e11d48" },
                ].map(({ icon: Icon, label, color }) => (
                  <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{ background: `${color}0d`, border: `1px solid ${color}22` }}>
                    <Icon size={9} style={{ color }} />
                    <span className="font-mono text-[8px] uppercase tracking-wider" style={{ color }}>{label}</span>
                  </div>
                ))}
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* ══ RIGHT — Order sidebar ══ */}
        <motion.aside
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 22, delay: 0.1 }}
          className="w-full lg:w-[380px] flex-shrink-0 lg:sticky lg:top-[88px] h-fit"
        >
          <div className="rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(160deg, #141018 0%, #0e0b13 100%)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }}>
            {/* Red top accent */}
            <div className="h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #e11d48, transparent)" }} />

            <div className="p-6 flex flex-col gap-5">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.05]">
                <h2 className="font-[family-name:var(--font-bebas)] text-2xl text-white tracking-wider">Your Order</h2>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded"
                  style={{ background: "rgba(10,15,18,0.8)", border: `1px solid ${isUrgent ? "rgba(225,29,72,0.3)" : "rgba(225,29,72,0.15)"}` }}>
                  <Timer size={13} className="text-[#e11d48]" style={{ opacity: isUrgent ? 1 : 0.6 }} />
                  <span className="font-mono text-sm font-bold tracking-widest" style={{ color: timerColor }}>
                    {expired ? "00:00" : timeDisplay}
                  </span>
                </div>
              </div>

              {/* Event summary */}
              <div className="flex gap-4 items-center">
                <div className="w-[72px] h-[72px] rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
                  style={{
                    background: event?.image_url ? undefined : "linear-gradient(135deg, #3d0015, #1a000a)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                  {event?.image_url ? (
                    <img src={event.image_url} alt="" className="w-full h-full object-cover" style={{ filter: "brightness(0.7)" }} />
                  ) : (
                    <span className="font-[family-name:var(--font-bebas)] text-3xl text-white/25">
                      {event?.title?.charAt(0).toUpperCase() ?? "?"}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-[family-name:var(--font-bebas)] text-xl text-white leading-tight tracking-wide uppercase truncate">
                    {event?.title ?? `Event #${eventId.slice(0, 8)}...`}
                  </h3>
                  <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider mt-0.5">
                    {event?.merchant?.name ?? "QueueGate Partner"}
                  </p>
                  <p className="font-mono text-[10px] font-bold mt-1.5" style={{ color: hydratedCategoryColor || "#e11d48" }}>
                    {hydratedCategoryName || "General Admission"}
                  </p>
                </div>
              </div>

              {/* Line items */}
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-sans text-sm text-white/80">1 × {hydratedCategoryName || "General Admission"}</p>
                    <p className="font-mono text-[9px] text-white/25 uppercase tracking-wider mt-0.5">FIFO Queue Admission</p>
                  </div>
                  <span className="font-mono text-sm font-bold text-[#ffb95f] ml-3">${ticketPrice.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
                  <p className="font-sans text-xs text-white/30">Service Fee</p>
                  <span className="font-mono text-xs text-white/30">$4.50</span>
                </div>
              </div>

              {/* Total */}
              <div className="rounded-xl p-4 flex items-center justify-between"
                style={{ background: "rgba(225,29,72,0.07)", border: "1px solid rgba(225,29,72,0.14)" }}>
                <span className="font-mono text-xs text-white/50 uppercase tracking-widest font-bold">Total</span>
                <span className="font-[family-name:var(--font-bebas)] text-4xl text-[#e11d48] tracking-wider"
                  style={{ filter: "drop-shadow(0 0 10px rgba(225,29,72,0.5))" }}>
                  ${total.toLocaleString()}
                </span>
              </div>

              {/* Divider */}
              <div className="h-px" style={{ background: "rgba(255,255,255,0.05)" }} />

              {/* Payment form */}
              <PaymentForm
                data={payment}
                onChange={handlePaymentChange}
                errors={paymentErrors}
                showCvv={showCvv}
                onToggleCvv={() => setShowCvv(v => !v)}
              />

              {/* Divider */}
              <div className="h-px" style={{ background: "rgba(255,255,255,0.05)" }} />

              {/* Processing step */}
              <AnimatePresence>
                {processingStep && (
                  <motion.div
                    key={processingStep}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.15)" }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      className="w-3 h-3 border-t border-[#facc15] rounded-full flex-shrink-0"
                    />
                    <span className="font-mono text-[10px] text-[#facc15] uppercase tracking-wider">{processingStep}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              <AnimatePresence>
                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-start gap-2 rounded-lg p-3 overflow-hidden"
                    style={{ background: "rgba(147,0,10,0.1)", border: "1px solid rgba(225,29,72,0.3)" }}
                  >
                    <ShieldAlert size={13} className="shrink-0 mt-0.5 text-[#ffb4ab]" />
                    <span className="font-mono text-[10px] text-[#ffb4ab]">{errorMessage}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CTA */}
              <motion.button
                whileHover={!submitting && !expired && !success ? { scale: 1.02, boxShadow: "0 0 40px rgba(225,29,72,0.7)" } : {}}
                whileTap={!submitting && !expired && !success ? { scale: 0.98 } : {}}
                onClick={handleCompletePurchase}
                disabled={submitting || expired || success}
                className="relative w-full py-4 rounded-xl font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 overflow-hidden transition-all duration-300 cursor-pointer"
                style={!submitting && !expired && !success ? {
                  background: "linear-gradient(135deg, #e11d48 0%, #be0037 100%)",
                  color: "white",
                  boxShadow: "0 0 24px rgba(225,29,72,0.4)",
                } : {
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.2)",
                }}
              >
                {/* Shimmer */}
                {!submitting && !expired && !success && (
                  <motion.span
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                    animate={{ x: ["-200%", "200%"] }}
                    transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3 }}
                  />
                )}
                <Lock size={12} />
                {processingStep
                  ? processingStep.replace("...", "").trim()
                  : submitting ? "PROCESSING..." : success ? "PURCHASE COMPLETE" : "PAY NOW"}
                {!submitting && !success && !expired && <ChevronRight size={12} />}
              </motion.button>

              <p className="text-center font-mono text-[8px] text-white/15 uppercase tracking-[0.2em]">
                Powered by QueueGate Cryptographic Shield
              </p>
            </div>
          </div>
        </motion.aside>
      </div>

      {/* ── OPS_ADMIN HUD ── */}
      {isOpsAdmin && (
        <div className="fixed bottom-0 left-0 w-full py-2.5 px-6 z-50 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ background: "#050508", borderTop: "1px solid rgba(225,29,72,0.12)" }}>
          <div className="font-mono text-[9px] text-[#e11d48]/60 flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e11d48] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#e11d48]" />
            </span>
            OPS ADMIN GATEWAY CONTROLS
          </div>
          <div className="flex gap-3">
            {[
              { label: "Inject Failure", inject: true, isActive: failureActive },
              { label: "Clear Failure",  inject: false, isActive: !failureActive },
            ].map(({ label, inject, isActive }) => (
              <button key={label}
                onClick={() => handleInjectFailure(inject)}
                disabled={injectingFailure}
                className="px-3 py-1 rounded font-mono text-[9px] uppercase tracking-wider transition-all cursor-pointer hover:scale-105"
                style={{
                  background: isActive ? (inject ? "rgba(225,29,72,0.1)" : "rgba(0,184,124,0.1)") : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isActive ? (inject ? "rgba(225,29,72,0.35)" : "rgba(0,184,124,0.35)") : "rgba(255,255,255,0.07)"}`,
                  color: isActive ? (inject ? "#ffb4ab" : "#00b87c") : "#9ca3af",
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
