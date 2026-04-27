import { nowIso } from "./common.js";

const DEFAULT_KEYS = {
  signup_initial_credits: 10,
  credit_pack_size: 10,
  credit_pack_price_cents: 0,
};

export async function ensurePlatformSettingsDefaults(db) {
  for (const [key, value] of Object.entries(DEFAULT_KEYS)) {
    const row = await db.get("SELECT key FROM platform_settings WHERE key = ?", key);
    if (!row) {
      await db.run("INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?)", key, JSON.stringify(value), nowIso());
    }
  }
}

export async function getPlatformSettingNumber(db, key, fallback) {
  const row = await db.get("SELECT value_json FROM platform_settings WHERE key = ?", key);
  if (!row?.value_json) return fallback;
  try {
    const v = JSON.parse(row.value_json);
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

export async function getSignupInitialCredits(db) {
  const n = await getPlatformSettingNumber(db, "signup_initial_credits", DEFAULT_KEYS.signup_initial_credits);
  return Math.max(0, Math.min(1_000_000, Math.floor(n)));
}

export async function getCreditPackSize(db) {
  const n = await getPlatformSettingNumber(db, "credit_pack_size", DEFAULT_KEYS.credit_pack_size);
  return Math.max(1, Math.min(10_000, Math.floor(n)));
}

export async function getCreditPackPriceCents(db) {
  const n = await getPlatformSettingNumber(db, "credit_pack_price_cents", DEFAULT_KEYS.credit_pack_price_cents);
  return Math.max(0, Math.min(100_000_000, Math.floor(n)));
}

export async function getAllPlatformSettings(db) {
  await ensurePlatformSettingsDefaults(db);
  const rows = await db.all("SELECT key, value_json, updated_at FROM platform_settings ORDER BY key");
  const out = {};
  for (const r of rows) {
    try {
      out[r.key] = { value: JSON.parse(r.value_json), updatedAt: r.updated_at };
    } catch {
      out[r.key] = { value: r.value_json, updatedAt: r.updated_at };
    }
  }
  return out;
}

export async function upsertPlatformSettings(db, partial) {
  await ensurePlatformSettingsDefaults(db);
  const allowed = new Set(Object.keys(DEFAULT_KEYS));
  for (const [key, raw] of Object.entries(partial)) {
    if (!allowed.has(key)) continue;
    await db.run(
      "INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
      key,
      JSON.stringify(raw),
      nowIso(),
    );
  }
}
