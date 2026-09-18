import type { Metadata } from "next";
import { MotionConfig } from "framer-motion";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { heading, inter } from "./fonts";
import { DECK } from "@/data";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";

export const metadata: Metadata = {
  // Absolute base for OG/twitter image URLs (the quiz share cards). Vercel
  // fills the production domain; NEXT_PUBLIC_SITE_URL overrides it elsewhere.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000")
  ),
  title: `Flashcards — ${DECK.title}`,
  description: "Learning new things should be fun. Type a topic and play a quiz written for you.",
  openGraph: {
    title: `Flashcards — ${DECK.title}`,
    description: "Learning new things should be fun. Type a topic and play a quiz written for you.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${heading.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        {/* Honour the OS reduced-motion setting inside every framer-motion
            component (transforms drop, opacity fades stay). */}
        <MotionConfig reducedMotion="user">
          <ThemeProvider>{children}</ThemeProvider>
        </MotionConfig>
        <Analytics />
      </body>
    </html>
  );
}
