/**
 * SEKME-F1.1 · çalışma sekmelerinin `localStorage` KALICILIĞI.
 *
 * Kullanıcı id'si başına ayrı anahtar; Çıkış'ta silinir. OKUMA her zaman
 * try/catch içindedir ve ŞEMA elle doğrulanır (zod YOK, tip koruyucu ile) —
 * bozuk/okunamayan veri SESSİZCE varsayılana döner (kısmi kurtarma YOK: tek
 * sekme bozuksa TÜM veri reddedilir).
 *
 * 🔴 GÜVENLİK: url doğrulaması `url-safety.ts`teki TEK ortak fonksiyondan
 * (`isSafeInternalUrl`) geçer — reducer da AYNI fonksiyonu kullanır (Y1/Y2
 * bulgusu: iki ayrı doğrulama biri diğerinden gevşekti).
 *
 * `url`/`title` uzunluk sınırları (D8) ve `moduleKey === moduleOf(url).key`
 * denetimi de burada: aksi hâlde bozuk/şişirilmiş bir tek sekme tüm kayıtlı
 * durumu (kısmi kurtarma YOK kuralı gereği) sessizce geçersiz kılabilir ya da
 * reducer'ın panel değişmezini (moduleKey her zaman url'in gerçek modülü)
 * bozan veri sessizce kabul edilebilir.
 */
import { moduleOf } from "./module-of";
import { MAX_TAB_TITLE_LENGTH, MAX_WORKSPACE_TABS, PANEL_TAB_ID, PANEL_URL } from "./types";
import { isSafeInternalUrl } from "./url-safety";
import type { WorkspaceTab, WorkspaceTabsState } from "./types";

const STORAGE_PREFIX = "fiil.workspaceTabs.v1:";
const SCHEMA_VERSION = 1;

export function workspaceTabsStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function isValidTab(value: unknown): value is WorkspaceTab {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || v.id.length === 0) return false;
  // `isSafeInternalUrl` KENDİ İÇİNDE `MAX_TAB_URL_LENGTH` sınırını da denetler
  // (N1 bulgusu: sınır eskiden yalnız burada, iki ayrı sabitle duruyordu).
  if (typeof v.url !== "string" || !isSafeInternalUrl(v.url)) return false;
  if (typeof v.moduleKey !== "string") return false;
  if (v.moduleKey !== moduleOf(v.url).key) return false;
  if (typeof v.title !== "string" || v.title.length > MAX_TAB_TITLE_LENGTH) return false;
  if (typeof v.lastViewedAt !== "number" || !Number.isFinite(v.lastViewedAt)) return false;
  if (typeof v.pinned !== "boolean") return false;
  return true;
}

function isValidState(value: unknown): value is WorkspaceTabsState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== SCHEMA_VERSION) return false;
  if (typeof v.activeId !== "string") return false;
  if (!Array.isArray(v.tabs)) return false;
  const tabs = v.tabs;
  if (tabs.length < 1 || tabs.length > MAX_WORKSPACE_TABS) return false;
  if (!tabs.every(isValidTab)) return false;

  const validTabs = tabs as WorkspaceTab[];
  const ids = new Set(validTabs.map((t) => t.id));
  if (ids.size !== validTabs.length) return false; // çift id yok

  const first = validTabs[0];
  if (first.id !== PANEL_TAB_ID || !first.pinned || first.url !== PANEL_URL) return false;
  if (validTabs.slice(1).some((t) => t.pinned)) return false; // başka pinned yok

  if (!ids.has(v.activeId as string)) return false;

  return true;
}

export function loadWorkspaceTabs(userId: string, storage?: Storage): WorkspaceTabsState | null {
  try {
    const target = resolveStorage(storage);
    if (!target) return null;
    const raw = target.getItem(workspaceTabsStorageKey(userId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) return null;
    const { tabs, activeId } = parsed as WorkspaceTabsState & { version: number };
    return { tabs, activeId };
  } catch {
    return null;
  }
}

export function saveWorkspaceTabs(
  userId: string,
  state: WorkspaceTabsState,
  storage?: Storage,
): boolean {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    const payload = JSON.stringify({ version: SCHEMA_VERSION, ...state });
    target.setItem(workspaceTabsStorageKey(userId), payload);
    return true;
  } catch {
    return false;
  }
}

export function clearWorkspaceTabs(userId: string, storage?: Storage): boolean {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    target.removeItem(workspaceTabsStorageKey(userId));
    return true;
  } catch {
    return false;
  }
}

/** Çıkışta userId elde olmayabilir — önekli TÜM anahtarları siler. */
export function clearAllWorkspaceTabs(storage?: Storage): boolean {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    const keysToRemove: string[] = [];
    for (let i = 0; i < target.length; i++) {
      const key = target.key(i);
      if (key !== null && key.startsWith(STORAGE_PREFIX)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
