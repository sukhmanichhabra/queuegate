"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueueSocket } from "@/hooks/useQueueSocket";
import { useQueueStore } from "@/stores/queue-store";
import { AdmissionCelebration } from "@/components/queue/AdmissionCelebration";
import { PositionCounter, ETADisplay, QueueVisualizer } from "@/components/queue/QueueWidgets";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { socket, connectSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { Shield, Wifi, RefreshCw } from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";

/* ── Animated background scan line ── */
function ScanLine() {
  return (
    <motion.div
      className="absolute inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#e11d48]/40 to-transparent pointer-events-none z-0"
      animate={{ top: ["0%", "100%"] }}
      transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
    />
  );
}

/* ── Floating particle ── */
function Particles() {
  const particles = Array.from({ length: 18 });
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 3 + 1,
            height: Math.random() * 3 + 1,
            left: `${Math.random() * 100}%`,
            background:
              i % 3 === 0
                ? "rgba(225,29,72,0.5)"
                : i % 3 === 1
                ? "rgba(250,204,21,0.4)"
                : "rgba(255,255,255,0.2)",
          }}
          animate={{
            y: [0, -(Math.random() * 300 + 100)],
            opacity: [0, 0.8, 0],
            x: [(Math.random() - 0.5) * 60],
          }}
          transition={{
            duration: Math.random() * 8 + 6,
            repeat: Infinity,
            delay: Math.random() * 8,
            ease: "easeOut",
          }}
          initial={{ y: `${Math.random() * 100}vh`, opacity: 0 }}
        />
      ))}
    </div>
  );
}

/* ── Status bar at the top ── */
function StatusBar({ position, eventId }: { position: number; eventId: string }) {
  const [ws, setWs] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => setWs(socket.connected), 2000);
    return () => clearInterval(iv);
  }, []);

  return (
    <motion.div
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-3 bg-[#07070f]/80 backdrop-blur-md border-b border-white/[0.06]"
    >
      <div className="flex items-center gap-2">
        <Shield size={13} className="text-[#e11d48]" />
        <span className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-[0.18em]">
          QueueGate — Secured Session
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Live WS indicator */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                ws ? "bg-[#10b981]" : "bg-[#e11d48]"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                ws ? "bg-[#10b981]" : "bg-[#e11d48]"
              }`}
            />
          </span>
          <span className="font-mono text-[9px] text-[#9ca3af] uppercase tracking-[0.15em]">
            {ws ? "Live" : "Reconnecting"}
          </span>
        </div>

        <Wifi size={12} className="text-[#9ca3af]" />
      </div>
    </motion.div>
  );
}

export default function WaitingRoomPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { isReady } = useAuthGuard();
  const eventId = params.id;
  const { position, etaSeconds, status, setQueueState } = useQueueStore();

  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wsToken, setWsToken] = useState<string | null>(null);
  const [rejoining, setRejoining] = useState(false);

  useEffect(() => {
    let sid = localStorage.getItem("queuegate_session_id");
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem("queuegate_session_id", sid);
    }
    setSessionId(sid);
    const token = localStorage.getItem("queuegate_ws_token");
    setWsToken(token);
  }, []);

  useQueueSocket(eventId, sessionId, wsToken);

  useEffect(() => {
    if (!sessionId) return;
    const initialize = async () => {
      try {
        const wsPromise = new Promise<void>((resolve) => {
          connectSocket();
          const tok = localStorage.getItem("queuegate_ws_token");
          if (socket.connected) {
            socket.emit("subscribe", { eventId, sessionId, ...(tok ? { wsToken: tok } : {}) });
            resolve();
          } else {
            socket.once("connect", () => {
              socket.emit("subscribe", { eventId, sessionId, ...(tok ? { wsToken: tok } : {}) });
              resolve();
            });
          }
        });
        await wsPromise;
        const res = await api.get(`/events/${eventId}/position?sessionId=${sessionId}`);
        if (res.data.status === 'ADMITTED' && res.data.checkoutToken) {
          useQueueStore.getState().setAdmitted(res.data);
        } else {
          setQueueState(res.data);
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          toast.error("You are not currently in the queue. Redirecting...");
          setTimeout(() => router.push(`/events/${eventId}`), 2000);
        }
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, [eventId, sessionId, setQueueState, router]);

  const handleRejoin = useCallback(async () => {
    setRejoining(true);
    try {
      const res = await api.post(`/events/${eventId}/join`, { sessionId });
      if (res.data.wsToken) {
        localStorage.setItem("queuegate_ws_token", res.data.wsToken);
        setWsToken(res.data.wsToken);
      }
      setQueueState(res.data);
      toast.success("Successfully rejoined the queue!");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to rejoin queue.");
    } finally {
      setRejoining(false);
    }
  }, [eventId, sessionId, setQueueState]);

  useEffect(() => {
    console.log("[WaitingRoomPage] status changed to:", status);
    if (status === 'ADMITTED') {
      console.log("[WaitingRoomPage] Admitted! Setting timeout to redirect to checkout in 3s...");
      const timer = setTimeout(() => {
        console.log("[WaitingRoomPage] Redirecting to checkout NOW via window.location.href");
        window.location.href = `/events/${eventId}/checkout`;
      }, 3000);
      return () => {
        console.log("[WaitingRoomPage] Clearing timeout (unmounted or status changed)");
        clearTimeout(timer);
      };
    }
  }, [status, eventId]);

  /* ── Not authenticated (redirecting) ── */
  if (!isReady) return null;

  /* ── Loading ── */
  if (loading) {
    return (
      <main className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <Particles />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-5 text-center"
        >
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-[#e11d48]/20" />
            <div className="absolute inset-0 rounded-full border-t-2 border-[#e11d48] animate-spin" />
            <Shield
              size={22}
              className="absolute inset-0 m-auto text-[#e11d48]"
            />
          </div>
          <div>
            <p className="font-[family-name:var(--font-bebas)] text-2xl text-white tracking-widest">
              Securing your spot...
            </p>
            <p className="font-mono text-xs text-[#9ca3af] mt-1 tracking-wider">
              Connecting to live queue
            </p>
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070f] relative overflow-hidden text-white">
      <Particles />

      {/* Ambient gradient blobs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#e11d48]/6 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#facc15]/5 rounded-full blur-[100px]" />
      </div>

      {/* Scan line */}
      <ScanLine />

      {/* Top status bar */}
      <StatusBar position={position || 0} eventId={eventId} />

      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pt-28 pb-16 min-h-screen flex flex-col justify-center gap-8">

        {/* ── WAITING STATE ── */}
        <AnimatePresence mode="wait">
          {status === "WAITING" && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-6"
            >
              {/* Page title */}
              <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="text-center mb-2"
              >
                <span className="font-mono text-[10px] text-[#e11d48] uppercase tracking-[0.25em]">
                  {'// Active Queue'}
                </span>
                <h1 className="font-[family-name:var(--font-bebas)] text-4xl sm:text-5xl text-white uppercase tracking-wide mt-1">
                  You&apos;re In Line
                </h1>
                <p className="font-mono text-xs text-[#9ca3af] mt-1 tracking-wider">
                  Stay on this page — you&apos;ll be admitted automatically
                </p>
              </motion.div>

              {/* 3-panel grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Position */}
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="bg-[#0c0c14] border border-white/[0.07] rounded-2xl p-6 relative overflow-hidden"
                >
                  <PositionCounter position={position || 0} />
                </motion.div>

                {/* ETA */}
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.18 }}
                  className="bg-[#0c0c14] border border-white/[0.07] rounded-2xl p-6 relative overflow-hidden"
                >
                  <ETADisplay etaSeconds={etaSeconds} />
                </motion.div>

                {/* Crowd visualizer */}
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.26 }}
                  className="bg-[#0c0c14] border border-white/[0.07] rounded-2xl p-6 relative overflow-hidden"
                >
                  <QueueVisualizer position={position || 0} />
                </motion.div>
              </div>

              {/* Tip strip */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-center justify-center gap-3 text-center"
              >
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.06]" />
                <span className="font-mono text-[10px] text-[#6b7280] uppercase tracking-[0.15em]">
                  🔒 Your position is cryptographically locked — refreshing is safe
                </span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.06]" />
              </motion.div>
            </motion.div>
          )}

          {/* ── ADMITTED STATE ── */}
          {status === "ADMITTED" && (
            <motion.div
              key="admitted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <AdmissionCelebration />
            </motion.div>
          )}

          {/* ── EXPIRED STATE ── */}
          {status === "EXPIRED" && (
            <motion.div
              key="expired"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center"
            >
              <div className="bg-[#0c0c14] border border-[#e11d48]/20 rounded-2xl p-12 text-center max-w-md w-full relative overflow-hidden">
                {/* Red top border accent */}
                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#e11d48] to-transparent" />

                <div className="text-5xl mb-5">⏳</div>
                <h2 className="font-[family-name:var(--font-bebas)] text-4xl text-white mb-2 tracking-wide">
                  Window Closed
                </h2>
                <p className="font-mono text-xs text-[#9ca3af] mb-8 leading-relaxed">
                  Your checkout window expired. Rejoin the queue to try again — your loyalty is noted.
                </p>
                <motion.button
                  whileHover={{ scale: 1.03, boxShadow: "0 0 24px rgba(225,29,72,0.5)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleRejoin}
                  disabled={rejoining}
                  className="w-full bg-[#e11d48] hover:bg-[#ff1a4b] text-white font-[family-name:var(--font-bebas)] text-2xl py-4 rounded-xl tracking-[0.12em] uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {rejoining ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Rejoining...
                    </>
                  ) : (
                    "Rejoin Queue"
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
