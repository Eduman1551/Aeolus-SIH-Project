import type { Metadata } from "next";
import localFont from "next/font/local";
import AppShell from "@/components/shell/AppShell";
import "./globals.css";

// Inter, bundled locally so the app also works offline (OFL licence in ./fonts)
const inter = localFont({
  src: "./fonts/Inter-Variable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aeolus · Air Ops Planner",
  description: "Decision support for air-operations planning. Synthetic data only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
