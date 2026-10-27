import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  /* config options here */
};

export default async function config(phase: string): Promise<NextConfig> {
  // Cloudflare bindings for `next dev` only. `next build` and `next start` (Railway) don't use
  // them, so they shouldn't start a local Workers runtime.
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
    await initOpenNextCloudflareForDev();
  }
  return nextConfig;
}
