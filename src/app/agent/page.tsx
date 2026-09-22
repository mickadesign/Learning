import type { Metadata } from "next";
import { HomeScreen } from "@/components/home-screen";

// Where the copied agent prompt sends the agent: the home screen, told up
// front that an agent is on its way, so it greets it before its first
// tool call. A route rather than a query flag, so it holds on every render.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AgentPage() {
  return <HomeScreen agentExpected />;
}
