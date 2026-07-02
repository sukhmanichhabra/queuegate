"use client";

/**
 * useAuthGuard — Client-side authentication guard hook.
 *
 * Use this as a secondary guard in page components (the primary guard is the
 * Next.js Edge middleware in middleware.ts). This prevents any flash of
 * protected content during client-side navigation where the middleware doesn't
 * intercept (e.g. `router.push()` within the same SPA session).
 *
 * Usage (call at the top of any protected page component):
 *   const { isReady } = useAuthGuard();
 *   if (!isReady) return null; // or a loading spinner
 *
 * Behaviour:
 *   - Not authenticated → redirect to /login?returnUrl=<current path>
 *   - Authenticated     → sets isReady=true so the page renders
 */

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export function useAuthGuard(): { isReady: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const { email, hydrate } = useAuthStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    // Determine auth state from store or localStorage directly (post-hydration)
    const storedEmail =
      email ?? (typeof window !== "undefined" ? localStorage.getItem("userEmail") : null);

    if (!storedEmail) {
      // Not authenticated — redirect to login preserving the intended destination
      const returnUrl = encodeURIComponent(pathname);
      router.replace(`/login?returnUrl=${returnUrl}`);
      return;
    }

    setIsReady(true);
  }, [email, pathname, router]);

  return { isReady };
}
