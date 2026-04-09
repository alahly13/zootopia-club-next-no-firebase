function readEnv(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getSupabaseUrl() {
  return (
    readEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
    || readEnv(process.env.SUPABASE_URL)
  );
}

export function getSupabasePublishableKey() {
  return (
    readEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    || readEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function hasSupabasePublicRuntime() {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

export function getSupabaseProjectRef() {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    return null;
  }

  try {
    const host = new URL(supabaseUrl).hostname;
    const [projectRef] = host.split(".");
    return projectRef || null;
  } catch {
    return null;
  }
}
