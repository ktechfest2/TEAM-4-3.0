import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: { absolute: "Confam: one phone call to know what's true on election day" },
};

export default function Home() {
  return <Landing />;
}
