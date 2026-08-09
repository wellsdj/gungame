import type { Metadata } from "next";
import GameClient from "./game-client";

export const metadata: Metadata = {
  title: "GUNGAME — Neon Arena",
  description: "A fast, free, peer-to-peer 3D browser blaster game.",
};

export default function Home() {
  return <GameClient />;
}
