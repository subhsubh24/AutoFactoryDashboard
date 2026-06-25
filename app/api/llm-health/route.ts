import { NextResponse } from "next/server";
import { checkLlmHealth } from "@/lib/narrative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/llm-health — confirm the deployed app can reach its LLM provider.
 *
 * Runs the same callLLM path the digests use, at runtime, so it reflects the
 * real env/scope of this deployment. Auth-gated by middleware (it's not in the
 * matcher exclusions, so it requires the dashboard password cookie). Returns
 * `{ ok, provider, model, geminiKey, openrouterKey, reason, sample, hint }` —
 * never the key value itself.
 */
export async function GET() {
  const health = await checkLlmHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
