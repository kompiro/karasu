const KEY_API_KEY = "karasu.ai.anthropic.apiKey";
const KEY_PERSIST = "karasu.ai.settings.persist";

export type PersistSetting = "session" | "local";

export function getPersistSetting(): PersistSetting {
  return localStorage.getItem(KEY_PERSIST) === "local" ? "local" : "session";
}

function setPersistSetting(setting: PersistSetting): void {
  localStorage.setItem(KEY_PERSIST, setting);
}

export function getStoredApiKey(): string | null {
  const persist = getPersistSetting();
  const storage = persist === "local" ? localStorage : sessionStorage;
  return storage.getItem(KEY_API_KEY);
}

export function setStoredApiKey(apiKey: string, persist?: PersistSetting): void {
  const setting = persist ?? getPersistSetting();
  setPersistSetting(setting);
  const storage = setting === "local" ? localStorage : sessionStorage;
  storage.setItem(KEY_API_KEY, apiKey);
  // Clear the other storage to avoid stale key
  if (setting === "local") {
    sessionStorage.removeItem(KEY_API_KEY);
  } else {
    localStorage.removeItem(KEY_API_KEY);
  }
}

export function clearStoredApiKey(): void {
  sessionStorage.removeItem(KEY_API_KEY);
  localStorage.removeItem(KEY_API_KEY);
}
