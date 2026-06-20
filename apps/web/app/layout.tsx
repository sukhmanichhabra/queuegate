"use client";

import { Inter, Bebas_Neue, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { NavBar } from "@/components/NavBar";
import { PageTransition } from "@/components/PageTransition";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 5_000 },
        },
      })
  );

  return (
    <html
      lang="en"
      className={cn(
        "dark",
        inter.variable,
        bebasNeue.variable,
        jetbrainsMono.variable
      )}
    >
      <head>
        <title>QueueGate — Fair Access at Any Scale</title>
        <meta
          name="description"
          content="QueueGate gives every shopper a fair, transparent place in line — powered by real-time FIFO queuing technology with cryptographic admission tokens."
        />
        <meta name="theme-color" content="#07070f" />
      </head>
      <body
        className={`${inter.className} bg-[#07070f] text-[#dfe3e7] min-h-screen antialiased`}
      >
        <QueryClientProvider client={queryClient}>
          {/* Global fixed nav */}
          <NavBar />
          {/* Page body offset for fixed nav */}
          <div className="pt-16">
            <PageTransition>{children}</PageTransition>
          </div>
          {/* Global toast notifications */}
          <Toaster
            position="top-right"
            duration={4000}
            toastOptions={{
              classNames: {
                success:
                  "!bg-[rgba(0,184,124,0.15)] !border !border-[#00b87c]/30 !text-[#00b87c]",
                error:
                  "!bg-[rgba(225,29,72,0.15)] !border !border-[#e11d48]/30 !text-[#ffb3b6]",
                info: "!bg-[rgba(255,255,255,0.04)] !border !border-white/[0.08] !text-white",
              },
            }}
          />
        </QueryClientProvider>
      </body>
    </html>
  );
}
