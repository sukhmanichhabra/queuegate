"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { motion } from "framer-motion";
import { Ticket, MapPin, Calendar, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export default function MyTicketsPage() {
  const { isReady } = useAuthGuard();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { hydrate: hydrateAuth, accessToken } = useAuthStore();

  useEffect(() => {
    hydrateAuth();
    const sid = localStorage.getItem("queuegate_session_id");
    if (sid) setSessionId(sid);
  }, [hydrateAuth]);

  // Fetch tickets using React Query
  const { data: tickets, isLoading, error } = useQuery({
    queryKey: ["my-tickets", sessionId, accessToken],
    queryFn: async () => {
      // If we don't have a session ID or access token, we can't fetch anything yet
      if (!sessionId && !accessToken) return [];
      
      const res = await api.get("/events/my-tickets", {
        params: { sessionId: sessionId || undefined },
      });
      return res.data;
    },
    enabled: !!(sessionId || accessToken) && isReady,
  });

  if (!isReady) return null;

  return (
    <div className="min-h-screen bg-[#07070f] text-[#dfe3e7] pt-12 pb-32">
      <div className="noise-overlay" />
      
      <div className="max-w-5xl mx-auto px-6 md:px-12 relative z-10">
        <header className="mb-12 border-b border-white/[0.05] pb-6 flex items-center justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-bebas)] text-4xl text-white uppercase tracking-wider mb-2">
              My Tickets
            </h1>
            <p className="font-mono text-xs text-[#9ca3af] uppercase tracking-widest">
              Passes Secured via QueueGate
            </p>
          </div>
          <div className="w-12 h-12 bg-[#00b87c]/10 border border-[#00b87c]/30 rounded flex items-center justify-center">
            <Ticket className="text-[#00b87c]" size={24} />
          </div>
        </header>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-16 h-1 bg-[#e11d48] mx-auto rounded-full animate-pulse" />
            <div className="font-[family-name:var(--font-bebas)] text-xl text-[#9ca3af] tracking-widest animate-pulse">
              RETRIEVING SECURE PASSES...
            </div>
          </div>
        ) : error ? (
          <div className="glass-panel p-8 rounded-xl text-center border-l-4 border-l-[#e11d48]">
            <p className="font-mono text-sm text-[#ffb4ab]">
              Unable to load tickets. Please try again later.
            </p>
          </div>
        ) : tickets?.length === 0 ? (
          <div className="glass-panel p-16 rounded-xl flex flex-col items-center justify-center text-center border-dashed border-2 border-white/[0.1]">
            <Ticket className="text-white/[0.2] mb-6" size={48} />
            <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-white mb-2 tracking-wide">
              NO TICKETS FOUND
            </h3>
            <p className="font-mono text-xs text-[#9ca3af] mb-8 uppercase tracking-widest max-w-sm">
              You haven't secured any passes yet. Head over to the events page to see what's coming up.
            </p>
            <Link 
              href="/events"
              className="bg-[#e11d48] text-white px-8 py-3 rounded font-mono text-xs uppercase tracking-widest hover:bg-[#be0037] transition-all glow-button"
            >
              Browse Events
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tickets?.map((ticket: any, index: number) => {
              const ticketRef = `QGATE-${ticket.id.slice(0, 8).toUpperCase()}`;
              const eventDate = new Date(ticket.event.show_date);
              
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  key={ticket.id}
                  className="bg-[#171c1f] border border-white/[0.08] rounded-xl overflow-hidden shadow-lg hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-all flex flex-col group relative"
                >
                  {/* Status Indicator */}
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#00b87c]/10 text-[#00b87c] px-2 py-1 rounded font-mono text-[9px] uppercase tracking-widest border border-[#00b87c]/20 z-10">
                    <CheckCircle size={10} />
                    Validated
                  </div>

                  {/* Header / Event Image Placeholder */}
                  <div className="h-32 bg-gradient-to-br from-[#e11d48]/20 to-[#07070f] relative p-6 flex flex-col justify-end border-b border-white/[0.05]">
                    <div className="absolute top-0 left-0 w-full h-full noise-overlay opacity-50" />
                    <h2 className="font-[family-name:var(--font-bebas)] text-3xl text-white tracking-wider relative z-10 leading-none shadow-black drop-shadow-md truncate">
                      {ticket.event.title}
                    </h2>
                    <p className="font-sans text-xs text-white/80 relative z-10 truncate">
                      {ticket.event.artist}
                    </p>
                  </div>

                  {/* Ticket Details */}
                  <div className="p-6 flex-grow flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4 border-b border-white/[0.05] pb-4">
                      <div className="flex items-start gap-2 text-[#9ca3af]">
                        <Calendar size={14} className="mt-0.5 shrink-0" />
                        <div>
                          <p className="font-mono text-[9px] uppercase tracking-widest mb-0.5 opacity-60">Date</p>
                          <p className="font-mono text-[11px] text-white">
                            {eventDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-[#9ca3af]">
                        <MapPin size={14} className="mt-0.5 shrink-0" />
                        <div>
                          <p className="font-mono text-[9px] uppercase tracking-widest mb-0.5 opacity-60">Venue</p>
                          <p className="font-mono text-[11px] text-white truncate max-w-[120px]">
                            {ticket.event.venue}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-end border-b border-white/[0.05] pb-4">
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-widest mb-1 text-[#9ca3af]">
                          Ticket Category
                        </p>
                        <p 
                          className="font-mono text-sm font-bold uppercase tracking-wider"
                          style={{ color: ticket.ticket_category?.color || '#e11d48' }}
                        >
                          {ticket.ticket_category?.name || 'General Admission'}
                        </p>
                      </div>
                      <div className="text-right">
                         <p className="font-mono text-[9px] uppercase tracking-widest mb-1 text-[#9ca3af]">
                          Qty
                        </p>
                        <p className="font-mono text-sm font-bold text-white">
                          {ticket.quantity}
                        </p>
                      </div>
                    </div>

                    {/* Barcode / Ref */}
                    <div className="mt-auto pt-2">
                       <div className="bg-white/5 rounded-lg p-3 flex flex-col items-center justify-center">
                          {/* Fake barcode */}
                          <div className="h-8 w-full flex items-center justify-center gap-[2px] opacity-70 mb-2 overflow-hidden">
                            {[1, 2, 1, 3, 1, 4, 1, 2, 2, 3, 1, 2, 1, 4, 1, 3, 2, 1, 2, 4, 1].map((w, i) => (
                              <div key={i} className="bg-white h-full" style={{ width: `${w * 1.5}px` }} />
                            ))}
                          </div>
                          <p className="font-mono text-[11px] text-[#ffb95f] tracking-[0.2em] font-bold">
                            {ticketRef}
                          </p>
                       </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
