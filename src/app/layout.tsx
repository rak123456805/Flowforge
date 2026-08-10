import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ApolloClientProvider } from "@/components/providers/apollo-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FlowForge — AI Agent Workflow Orchestrator",
    template: "%s | FlowForge",
  },
  description:
    "Build, automate, and monitor multi-step AI agent workflows with real-time execution tracking, approval gates, and enterprise-grade permissions.",
  keywords: [
    "AI workflow",
    "agent orchestration",
    "automation",
    "Groq",
    "n8n alternative",
  ],
  authors: [{ name: "FlowForge" }],
  openGraph: {
    title: "FlowForge — AI Agent Workflow Orchestrator",
    description: "Enterprise-grade AI workflow automation platform.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body className="bg-[#09090b] text-zinc-100 antialiased">
        <ApolloClientProvider>
          <AuthProvider>
            {children}
            <Toaster
              theme="dark"
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "#18181b",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#f4f4f5",
                },
              }}
            />
          </AuthProvider>
        </ApolloClientProvider>
      </body>
    </html>
  );
}
