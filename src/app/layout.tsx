import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthProvider";
import AppHeader from "@/components/AppHeader";
import AssistantSidebar from "@/components/AssistantSidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Opportunity Assessment",
  description: "Outside-in AI opportunity assessment: FTE mapping, prioritization matrix and business case.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <AuthProvider>
          <div className="flex flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <AppHeader />
              {children}
            </div>
            <AssistantSidebar />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
