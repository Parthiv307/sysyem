import { supabase } from "./supabaseClient";

// Mirrors the Claude-artifact window.storage API (get/set/delete/list) but
// persists to a real Postgres row instead. This means the ported app code
// doesn't need to know it's no longer running inside Claude at all.
//
// Storage model: one row per user in `hunter_data`, with a single jsonb
// column holding { [key]: value } — so multiple storage keys can coexist
// under one row, same as the original multi-key API allowed.

async function getRow(userId) {
  const { data, error } = await supabase
    .from("hunter_data")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.data || {};
}

async function saveRow(userId, row) {
  const { error } = await supabase
    .from("hunter_data")
    .upsert({ user_id: userId, data: row }, { onConflict: "user_id" });
  if (error) throw error;
}

export function createStorage(userId) {
  return {
    async get(key) {
      const row = await getRow(userId);
      if (!(key in row)) throw new Error(`Key "${key}" not found`);
      return { key, value: row[key], shared: false };
    },
    async set(key, value) {
      const row = await getRow(userId);
      row[key] = value;
      await saveRow(userId, row);
      return { key, value, shared: false };
    },
    async delete(key) {
      const row = await getRow(userId);
      delete row[key];
      await saveRow(userId, row);
      return { key, deleted: true, shared: false };
    },
    async list(prefix) {
      const row = await getRow(userId);
      const keys = Object.keys(row).filter((k) => !prefix || k.startsWith(prefix));
      return { keys, prefix, shared: false };
    },
  };
}

// Live sync: listens for any change to this user's row (from any device or
// tab) and calls onChange() so the app can refetch and re-render with the
// latest data. Returns an unsubscribe function.
export function subscribeToChanges(userId, onChange) {
  const channel = supabase
    .channel(`hunter_data_${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "hunter_data", filter: `user_id=eq.${userId}` },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
