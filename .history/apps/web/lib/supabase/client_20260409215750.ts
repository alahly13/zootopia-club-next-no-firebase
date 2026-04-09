"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabasePublicRuntime,
} from "@/lib/supabase/public-config";

let cachedClient: SupabaseClient | null = null;

export function isSupabaseWebConfigured() {
  return hasSupabasePublicRuntime();
}

export function getSupabaseClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();

  if (!supabaseUrl || !publishableKey) {
    throw new Error("SUPABASE_WEB_CONFIG_MISSING");
  }

  cachedClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}

export function primeEphemeralSupabaseClient() {
  return Promise.resolve(getSupabaseClient());
}

export async function getEphemeralSupabaseClient() {
  return getSupabaseClient();
}
