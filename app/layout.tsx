import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REVIVE — Revenue Recovery",
  description: "AI revenue recovery for Paystack-powered businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
