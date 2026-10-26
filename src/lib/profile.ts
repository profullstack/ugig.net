import { createProfileStore, type ProfileStore } from "@profullstack/profile";
import { createServiceClient } from "@/lib/supabase/service";

// The shared @profullstack/profile fields live in public.user_profiles (keyed
// by the auth user id), not on public.profiles: profiles is world-readable,
// and this table holds the contact email. Server-only (service-role client).
let cached: ProfileStore | null = null;

export function profileStore(): ProfileStore {
  cached ??= createProfileStore(createServiceClient(), { table: "user_profiles", key: "user_id" });
  return cached;
}

/**
 * Keep the public profiles.full_name working: fill it from first/last name
 * when it is empty, never overwrite one the user typed. A name with no Latin
 * letters is not copied, because profiles' spam trigger flags such a
 * full_name and the person never asked for one.
 */
export async function fillEmptyFullName(
  userId: string,
  firstName: string | null | undefined,
  lastName: string | null | undefined
): Promise<void> {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (!full || !/[a-zA-Z]/.test(full)) return;
  const svc = createServiceClient();
  const { data } = await svc.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  if (!data || data.full_name?.trim()) return;
  await svc.from("profiles").update({ full_name: full }).eq("id", userId);
}
