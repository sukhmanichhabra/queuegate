"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/glass/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function EditEventPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const eventId = params.id;
  const [submitting, setSubmitting] = useState(false);
  const [capacity, setCapacity] = useState(1000);
  const [rate, setRate] = useState(60);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");

  const { data: event } = useQuery({
    queryKey: ["merchant-event", eventId],
    queryFn: async () => {
      const res = await api.get(`/merchants/events/${eventId}`);
      return res.data;
    },
  });

  useEffect(() => {
    if (event) {
      setTitle(event.title || "");
      setDescription(event.description || "");
      setCapacity(event.capacity || 1000);
      setRate(event.admission_rate_per_min || 60);
      if (event.show_date) {
        const d = new Date(event.show_date);
        setStartsAt(d.toISOString().slice(0, 16));
      }
    }
  }, [event]);

  const estimatedMinutes = Math.ceil(capacity / rate);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await api.patch(`/merchants/events/${eventId}`, {
        title,
        description,
        startsAt: new Date(startsAt).toISOString(),
        capacity,
        admissionRatePerMin: rate,
      });
      toast.success("Event updated successfully!");
      router.push("/merchant/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update event.");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-extrabold mb-8"
        >
          Edit Event
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Event Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus-visible:ring-[var(--accent-primary)]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="startsAt">Start Date & Time</Label>
                <Input
                  id="startsAt"
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus-visible:ring-[var(--accent-primary)]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity</Label>
                <Input
                  id="capacity"
                  type="number"
                  required
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
                  className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus-visible:ring-[var(--accent-primary)]"
                />
              </div>

              <div className="space-y-3">
                <Label>Admission Rate: {rate} / min</Label>
                <input
                  type="range"
                  min={1}
                  max={500}
                  value={rate}
                  onChange={(e) => setRate(parseInt(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[var(--glass-bg)] accent-[var(--accent-primary)]"
                />
                <motion.p layout className="text-sm text-[var(--accent-secondary)]">
                  At this rate, full capacity admitted in ~{estimatedMinutes} min
                </motion.p>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl py-6 text-lg font-bold bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white hover:opacity-90"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </span>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </form>
          </GlassCard>
        </motion.div>
      </div>
    </main>
  );
}
