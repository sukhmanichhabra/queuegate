"use client";

/**
 * useRoleGuard — Reusable role-based route guard hook.
 *
 * Usage (call at the top of any page component):
 *   useRoleGuard('OPS_ADMIN');        // redirects if not OPS_ADMIN
 *   useRoleGuard('MERCHANT_ADMIN');   // redirects if not MERCHANT_ADMIN
 *
 * Behaviour:
 *   - Not authenticated        → redirect to /login
 *   - Wrong role               → redirect to / with a toast
 *   - Correct role             → no-op (page renders normally)
 *
 * Returns `{ isAuthorized }` so the page can gate its render while
 * the auth store is hydrating (avoids a flash of the protected content).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";

export function useRoleGuard(requiredRole: string): { isAuthorized: boolean } {
  const router = useRouter();
  const { email, role, hydrate } = useAuthStore();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Hydrate from localStorage on mount
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    // Wait until we have something from the store (post-hydration)
    const storedRole =
      role ?? (typeof window !== "undefined" ? localStorage.getItem("userRole") : null);
    const storedEmail =
      email ?? (typeof window !== "undefined" ? localStorage.getItem("userEmail") : null);

    if (!storedEmail) {
      // Not authenticated at all
      router.replace("/login");
      return;
    }

    if (storedRole !== requiredRole) {
      toast.error(`Access denied. ${requiredRole} role required.`, { duration: 4000 });
      router.replace("/");
      return;
    }

    setIsAuthorized(true);
  }, [email, role, requiredRole, router]);

  return { isAuthorized };
}
