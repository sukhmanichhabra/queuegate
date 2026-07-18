"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/glass/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImageIcon, AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";


/**
 * Returns true if the URL is a raw image (ends in known ext or is from a CDN),
 * false if it looks like a Google image-search page or other non-image URL.
 */
function isDirectImageUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    // Block Google image search result pages
    if (u.hostname.includes('google.com') && u.pathname.includes('/imgres')) return false;
    if (u.hostname.includes('google.com') && u.searchParams.has('imgurl')) return false;
    // Accept obvious image extensions
    const ext = u.pathname.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg','jpeg','png','webp','gif','avif','svg'].includes(ext)) return true;
    // Accept known CDNs that serve images via non-extension URLs
    const cdns = ['unsplash.com','images.unsplash.com','pexels.com','cloudinary.com',
      'imgur.com','i.imgur.com','cdn.', 'scdn.co','staticflickr.com','twimg.com',
      'googleusercontent.com','wikimedia.org','pinimg.com','fastly.net'];
    if (cdns.some(cdn => u.hostname.includes(cdn))) return true;
    return false;
  } catch {
    return false;
  }
}

export default function NewEventPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [capacity, setCapacity] = useState(1000);
  const [rate, setRate] = useState(60);
  const [ticketPrice, setTicketPrice] = useState<string>("50");
  const [imageUrl, setImageUrl] = useState("");
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Categories state
  const [enableCategories, setEnableCategories] = useState(false);
  const [categories, setCategories] = useState([
    { id: '1', name: 'General Admission', price: 50, capacity: 1000, color: '#f97316', description: '' }
  ]);

  const addCategory = () => {
    setCategories([...categories, { id: Math.random().toString(), name: 'New Zone', price: 50, capacity: 500, color: '#e11d48', description: '' }]);
  };

  const updateCategory = (id: string, field: string, value: any) => {
    setCategories(categories.map(c => c.id === id ? { ...c, [field]: value } : c));
  };
  
  const removeCategory = (id: string) => {
    if (categories.length > 1) {
      setCategories(categories.filter(c => c.id !== id));
    } else {
      toast.error("You must have at least one ticket category.");
    }
  };

  const estimatedMinutes = Math.ceil(capacity / rate);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);

    const form = new FormData(e.currentTarget);

    // Validate ticketPrice is a positive number (required by DTO: @IsNumber @IsPositive)
    const priceVal = parseFloat(ticketPrice);
    if (isNaN(priceVal) || priceVal <= 0) {
      toast.error("Ticket price must be a positive number.");
      setSubmitting(false);
      return;
    }

    // Warn if image URL looks like a Google search page
    const rawImageUrl = (form.get("imageUrl") as string) || "";
    if (rawImageUrl && !isDirectImageUrl(rawImageUrl)) {
      toast.error(
        "Image URL appears to be a search page, not a direct image link. " +
        "Right-click the image and choose 'Copy image address' to get a direct URL."
      );
      setSubmitting(false);
      return;
    }

    try {
      const payload: any = {
        title:               form.get("title") as string,
        artist:              form.get("artist") as string,
        venue:               form.get("venue") as string,
        showDate:            new Date(form.get("showDate") as string).toISOString(),
        ticketPrice:         priceVal,
        imageUrl:            rawImageUrl || undefined,
        description:         form.get("description") as string || undefined,
        capacity,
        admissionRatePerMin: rate,
      };

      if (enableCategories) {
        payload.categories = categories.map((c, i) => ({
          name: c.name,
          description: c.description || undefined,
          price: Number(c.price),
          capacity: Number(c.capacity),
          color: c.color,
          sortOrder: i
        }));
        
        // Ensure total capacity matches category capacities
        const totalCatCapacity = payload.categories.reduce((sum: number, c: any) => sum + c.capacity, 0);
        if (totalCatCapacity !== capacity) {
          toast.error(`Total category capacity (${totalCatCapacity}) must equal event capacity (${capacity})`);
          setSubmitting(false);
          return;
        }
      }

      await api.post("/merchants/events", payload);

      toast.success("Event created successfully!");
      router.push("/merchant/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create event.");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#07070f] text-[#dfe3e7]">
      <div className="max-w-2xl mx-auto px-6 py-14">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <span className="font-mono text-[10px] text-[#e11d48] uppercase tracking-[0.22em] block mb-2">
            {'// Merchant Portal'}
          </span>
          <h1 className="font-[family-name:var(--font-bebas)] text-5xl sm:text-6xl text-white uppercase tracking-wide leading-none">
            New Event
          </h1>
          <p className="font-mono text-xs text-[#9ca3af] mt-2 tracking-wider">
            All fields are required unless marked optional.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* ── IDENTITY SECTION ── */}
              <div className="space-y-1 mb-2">
                <p className="font-mono text-[10px] text-[#8b5cf6] uppercase tracking-[0.18em]">
                  Identity
                </p>
                <div className="h-px bg-[#8b5cf6]/20" />
              </div>

              {/* Event Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Event Title</Label>
                <Input
                  id="title"
                  name="title"
                  required
                  placeholder="After Hours Til Dawn"
                  className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus-visible:ring-[var(--accent-primary)]"
                />
              </div>

              {/* FEATURE 3: Artist — was hardcoded "TBD" */}
              <div className="space-y-2">
                <Label htmlFor="artist">
                  Artist / Headliner
                </Label>
                <Input
                  id="artist"
                  name="artist"
                  required
                  placeholder="The Weeknd"
                  className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus-visible:ring-[var(--accent-primary)]"
                />
              </div>

              {/* Event Hero Image URL — with live preview */}
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Event Image URL</Label>
                <Input
                  id="imageUrl"
                  name="imageUrl"
                  type="url"
                  required
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setImgLoaded(false);
                    setImgError(false);
                  }}
                  placeholder="https://images.unsplash.com/photo-xxx.jpg"
                  className={cn(
                    "bg-[var(--glass-bg)] border-[var(--glass-border)] focus-visible:ring-[var(--accent-primary)]",
                    imageUrl && imgError && "border-[#e11d48]/60",
                    imageUrl && imgLoaded && "border-[#00b87c]/60"
                  )}
                />

                {/* Validation hint */}
                {imageUrl && !isDirectImageUrl(imageUrl) && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-[#ee9800]/10 border border-[#ee9800]/30">
                    <AlertTriangle size={13} className="text-[#ffb95f] shrink-0 mt-0.5" />
                    <p className="text-[10px] text-[#ffb95f] font-mono leading-relaxed">
                      This looks like a <strong>search page URL</strong>, not a direct image link.
                      Right-click the image on the web and choose{" "}
                      <strong>&quot;Copy image address&quot;</strong> to get a direct URL (ending in .jpg, .png, etc.)
                    </p>
                  </div>
                )}

                {/* Live image preview */}
                {imageUrl && isDirectImageUrl(imageUrl) && (
                  <div className="relative rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.07]" style={{ height: 140 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Event preview"
                      onLoad={() => { setImgLoaded(true); setImgError(false); }}
                      onError={() => { setImgError(true); setImgLoaded(false); }}
                      className={cn(
                        "w-full h-full object-cover transition-opacity duration-500",
                        imgLoaded ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {!imgLoaded && !imgError && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                      </div>
                    )}
                    {imgError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <ImageIcon size={24} className="text-[#9ca3af]" />
                        <p className="font-mono text-[10px] text-[#9ca3af]">Could not load image — check the URL</p>
                      </div>
                    )}
                    {imgLoaded && (
                      <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-[#00b87c]/20 border border-[#00b87c]/40 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={10} className="text-[#00b87c]" />
                        <span className="font-mono text-[9px] text-[#00b87c]">Image loaded</span>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-[#6b7280] font-mono">
                  Paste a <strong>direct image link</strong> (e.g. from Unsplash, Pexels, or right-click → Copy image address).
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description <span className="text-[#6b7280] font-normal">(optional)</span></Label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  placeholder="Describe your event..."
                  className="w-full rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent text-white placeholder:text-[#6b7280]"
                />
              </div>

              {/* ── VENUE & DATE SECTION ── */}
              <div className="space-y-1 mb-2 pt-2">
                <p className="font-mono text-[10px] text-[#8b5cf6] uppercase tracking-[0.18em]">
                  Venue & Date
                </p>
                <div className="h-px bg-[#8b5cf6]/20" />
              </div>

              {/* FEATURE 3: Venue — was hardcoded "TBD" */}
              <div className="space-y-2">
                <Label htmlFor="venue">Venue</Label>
                <Input
                  id="venue"
                  name="venue"
                  required
                  placeholder="Wembley Stadium, London"
                  className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus-visible:ring-[var(--accent-primary)]"
                />
              </div>

              {/* Show Date — renamed from "startsAt" to "showDate" to match DTO field */}
              <div className="space-y-2">
                <Label htmlFor="showDate">Show Date &amp; Time</Label>
                <Input
                  id="showDate"
                  name="showDate"
                  type="datetime-local"
                  required
                  className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus-visible:ring-[var(--accent-primary)]"
                />
              </div>

              {/* ── TICKETING SECTION ── */}
              <div className="space-y-1 mb-2 pt-2">
                <p className="font-mono text-[10px] text-[#8b5cf6] uppercase tracking-[0.18em]">
                  Ticketing & Queue
                </p>
                <div className="h-px bg-[#8b5cf6]/20" />
              </div>

              {/* Ticketing Mode Toggle */}
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="enableCategories"
                  checked={enableCategories}
                  onChange={(e) => setEnableCategories(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-[#e11d48] focus:ring-[#e11d48]"
                />
                <Label htmlFor="enableCategories" className="cursor-pointer">
                  Use Multi-Tier Ticket Categories (Zones)
                </Label>
              </div>

              {!enableCategories ? (
                /* FEATURE 3: Ticket Price — was hardcoded 0 (also fails @IsPositive) */
                <div className="space-y-2">
                  <Label htmlFor="ticketPrice">Single Ticket Price (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] font-mono text-sm">
                      $
                    </span>
                    <Input
                      id="ticketPrice"
                      name="ticketPrice"
                      type="number"
                      required={!enableCategories}
                      min={0.01}
                      step={0.01}
                      value={ticketPrice}
                      onChange={(e) => setTicketPrice(e.target.value)}
                      placeholder="50.00"
                      className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus-visible:ring-[var(--accent-primary)] pl-7"
                    />
                  </div>
                </div>
              ) : (
                /* Category Builder */
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Ticket Zones</Label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={addCategory}
                      className="h-8 border-white/10 bg-white/5 hover:bg-white/10"
                    >
                      <Plus size={14} className="mr-1" /> Add Zone
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {categories.map((cat, idx) => (
                      <div key={cat.id} className="p-4 rounded-xl border border-white/10 bg-black/20 space-y-3 relative">
                        <div className="flex justify-between items-start">
                          <h4 className="font-mono text-xs text-[#9ca3af] uppercase tracking-wider">Zone {idx + 1}</h4>
                          <button 
                            type="button" 
                            onClick={() => removeCategory(cat.id)}
                            className="text-white/40 hover:text-[#e11d48] transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[10px]">Zone Name</Label>
                            <Input 
                              value={cat.name} 
                              onChange={(e) => updateCategory(cat.id, 'name', e.target.value)}
                              required={enableCategories}
                              className="h-8 bg-white/5 border-white/10 text-xs"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-[10px]">Price (USD)</Label>
                            <Input 
                              type="number" 
                              min="0.01" step="0.01"
                              value={cat.price} 
                              onChange={(e) => updateCategory(cat.id, 'price', e.target.value)}
                              required={enableCategories}
                              className="h-8 bg-white/5 border-white/10 text-xs"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-[10px]">Capacity</Label>
                            <Input 
                              type="number" 
                              min="1"
                              value={cat.capacity} 
                              onChange={(e) => updateCategory(cat.id, 'capacity', e.target.value)}
                              required={enableCategories}
                              className="h-8 bg-white/5 border-white/10 text-xs"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-[10px]">Color HEX</Label>
                            <div className="flex gap-2">
                              <input 
                                type="color" 
                                value={cat.color}
                                onChange={(e) => updateCategory(cat.id, 'color', e.target.value)}
                                className="h-8 w-8 rounded cursor-pointer bg-transparent border-0 p-0"
                              />
                              <Input 
                                value={cat.color} 
                                onChange={(e) => updateCategory(cat.id, 'color', e.target.value)}
                                className="h-8 bg-white/5 border-white/10 text-xs flex-1 uppercase font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {categories.reduce((acc, c) => acc + Number(c.capacity || 0), 0) !== capacity && (
                    <p className="text-[10px] text-[#ffb95f] font-mono mt-2">
                      <AlertTriangle size={10} className="inline mr-1" />
                      Total zone capacity ({categories.reduce((acc, c) => acc + Number(c.capacity || 0), 0)}) 
                      differs from event capacity ({capacity}). They must match!
                    </p>
                  )}
                </div>
              )}

              {/* Capacity */}
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity</Label>
                <Input
                  id="capacity"
                  name="capacity"
                  type="number"
                  required
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
                  className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus-visible:ring-[var(--accent-primary)]"
                />
              </div>

              {/* Admission Rate */}
              <div className="space-y-3">
                <Label>
                  Admission Rate:{" "}
                  <span className="text-[var(--accent-primary)] font-bold">{rate}</span> / min
                </Label>
                <input
                  type="range"
                  min={1}
                  max={500}
                  value={rate}
                  onChange={(e) => setRate(parseInt(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[var(--glass-bg)] accent-[var(--accent-primary)]"
                />
                <div className="flex justify-between">
                  <motion.p layout className="text-xs text-[var(--accent-secondary)] font-mono">
                    Full capacity admitted in ~{estimatedMinutes} min
                  </motion.p>
                  <p className="text-xs text-[#6b7280] font-mono">
                    {capacity.toLocaleString()} seats
                  </p>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl py-6 text-lg font-bold bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white hover:opacity-90"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  "Create Event"
                )}
              </Button>
            </form>
          </GlassCard>
        </motion.div>
      </div>
    </main>
  );
}
