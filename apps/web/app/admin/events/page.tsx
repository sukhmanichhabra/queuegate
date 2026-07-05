"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { GlassBadge } from "@/components/glass/GlassBadge";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

export default function AdminEventsListPage() {
  const router = useRouter();
  const { isAuthorized } = useRoleGuard("OPS_ADMIN");

  // ── Real data: GET /admin/events (OPS_ADMIN only) ──
  // BUG FIX: previously called GET /events (public). Now correctly calls the protected /admin/events route.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-all-events"],
    queryFn: async () => {
      const res = await api.get("/admin/events");
      return res.data;
    },
    enabled: isAuthorized,
  });

  const events: any[] = data?.data ?? data ?? [];

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="font-mono text-xs text-[#9ca3af] animate-pulse uppercase tracking-widest">
          Verifying OPS_ADMIN clearance...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#080810] text-[#dfe3e7]">
      <div className="px-6 md:px-12 py-12 max-w-7xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/[0.05] pb-6">
          <div>
            <button
              onClick={() => router.push("/admin/dashboard")}
              className="flex items-center gap-2 font-mono text-xs text-[#9ca3af] hover:text-[#ffb3b6] transition-colors mb-4 cursor-pointer"
            >
              <ArrowLeft size={13} />
              Admin Dashboard
            </button>
            <div className="flex items-center gap-3 mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e11d48] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e11d48] pulse-dot-red" />
              </span>
              <span className="font-mono text-[10px] text-[#e11d48] uppercase tracking-widest font-bold">
                OPS ADMIN
              </span>
            </div>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-[family-name:var(--font-bebas)] text-4xl sm:text-5xl md:text-6xl text-white tracking-wide"
            >
              ALL EVENTS
            </motion.h1>
            <p className="font-mono text-xs text-[#9ca3af] mt-1 uppercase tracking-widest">
              CROSS-MERCHANT VIEW — {events.length} EVENTS
            </p>
          </div>
        </div>

        {/* Table */}
        {isError ? (
          <div className="glass-panel p-16 text-center rounded-xl">
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="font-[family-name:var(--font-bebas)] text-2xl text-white mb-2 tracking-wide">
              ACCESS DENIED OR API ERROR
            </h3>
            <p className="font-mono text-xs text-[#9ca3af] mb-6 uppercase tracking-widest">
              Ensure you are authenticated as OPS_ADMIN.
            </p>
            <button
              onClick={() => refetch()}
              className="bg-[#e11d48] text-white px-8 py-3 rounded font-mono text-xs uppercase tracking-widest hover:bg-[#be0037] transition-all cursor-pointer glow-button"
            >
              Retry
            </button>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-xl overflow-hidden border border-white/[0.05]"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    {["Event", "Merchant", "Status", "Capacity", "Starts At", "Action"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-6 py-4 text-[#9ca3af] font-semibold uppercase tracking-wider text-[10px]"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isLoading &&
                    [...Array(6)].map((_, i) => (
                      <tr key={i} className="border-b border-white/[0.05]">
                        {[...Array(6)].map((__, j) => (
                          <td key={j} className="px-6 py-4">
                            <div
                              className="h-3 rounded bg-white/[0.04] animate-pulse"
                              style={{
                                width:
                                  j === 0
                                    ? "80%"
                                    : j === 5
                                    ? "70px"
                                    : "55%",
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}

                  {events.map((event: any) => {
                    const bv =
                      event.status === "ON_SALE"
                        ? "live"
                        : event.status === "ENDED"
                        ? "ended"
                        : "upcoming";

                    return (
                      <motion.tr
                        key={event.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors cursor-pointer group"
                        onClick={() => router.push(`/admin/events/${event.id}`)}
                      >
                        <td className="px-6 py-4 font-medium text-white group-hover:text-[#ffb3b6] transition-colors">
                          {event.title}
                        </td>
                        <td className="px-6 py-4 text-[#9ca3af]">
                          {event.merchant?.name ??
                            event.merchant_id?.slice(0, 8) ??
                            "—"}
                        </td>
                        <td className="px-6 py-4">
                          <GlassBadge variant={bv}>{event.status}</GlassBadge>
                        </td>
                        <td className="px-6 py-4 tabular-nums text-[#dfe3e7]">
                          {event.capacity?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-6 py-4 text-[#9ca3af]">
                          {event.show_date ? formatDate(event.show_date) : "—"}
                        </td>
                        <td className="px-6 py-4 text-[#e11d48] group-hover:text-[#ffb3b6] transition-colors flex items-center gap-1 mt-1">
                          View <ArrowUpRight size={12} />
                        </td>
                      </motion.tr>
                    );
                  })}

                  {!isLoading && events.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-12 text-center text-[#9ca3af] uppercase tracking-widest"
                      >
                        No events found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}
