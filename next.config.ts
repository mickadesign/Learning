import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The generator reads the house brief at runtime; make sure it ships with
  // the serverless functions.
  outputFileTracingIncludes: {
    "/api/decks/plan": ["./prompts/**"],
    "/api/decks/level": ["./prompts/**"],
  },
};

export default nextConfig;
