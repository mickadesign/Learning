import type { Metadata } from "next";
import { MotionConfig } from "framer-motion";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { heading, inter } from "./fonts";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";

// The site's identity — title, description, the OpenGraph card and the
// favicon set — comes from metadata.config.json via `npx metadata-gen`
// (the generated files live in public/metadata). The SVG favicon stays the
// app's own icon.svg; the generator's PNG/ICO set is drawn from it.
export const SITE_TITLE = "Human Memory";
export const SITE_DESCRIPTION =
  "Hey agent, make your human smarter. Flashcards written by your AI agent, one prompt away.";

export const metadata: Metadata = {
  // Absolute base for OG/twitter image URLs (the quiz share cards).
  // NEXT_PUBLIC_SITE_URL overrides; otherwise Vercel's production domain
  // (humanmemory.dev), falling back to localhost in development.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.NODE_ENV === "production"
          ? "https://humanmemory.dev"
          : "http://localhost:3000")
  ),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/metadata/og.png", width: 1200, height: 630, alt: SITE_TITLE }],
  },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/metadata/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/metadata/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/metadata/favicon.ico",
    apple: "/metadata/apple-touch-icon.png",
  },
  // A discoverable pointer to the capabilities reference for agents.
  alternates: { types: { "text/markdown": "/agents.md" } },
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
