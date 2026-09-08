import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Attribution } from "./attribution";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "F1 Fantasy",
  description: "Fantasy Formula 1 for a private friends' league.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* The attribution sits in the layout rather than on each page: the
          licence asks for it wherever the data appears, and a per-page notice
          is one forgotten page away from not being there. */}
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <Attribution />
      </body>
    </html>
  );
}
