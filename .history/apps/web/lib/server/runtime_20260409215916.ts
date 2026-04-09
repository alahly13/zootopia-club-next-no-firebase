import "server-only";

import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";

export function hasGoogleAiRuntime() {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

export function hasQwenRuntime() {
  return Boolean(process.env.DASHSCOPE_API_KEY);
}

export function getRuntimeFlags() {
  const supabaseAuthReady = hasSupabaseAdminRuntime();

  return {
    // Keep the historical key name stable for existing UI wiring.
    firebaseAdmin: supabaseAuthReady,
    supabaseAuth: supabaseAuthReady,
    googleAi: hasGoogleAiRuntime(),
    qwen: hasQwenRuntime(),
  };
}
