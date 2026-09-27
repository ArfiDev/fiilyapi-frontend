/**
 * SEKME-F1.3 · Kaydedilmemiş değişiklik kaydı (MERKEZİ, küçük).
 *
 * Keep-alive YOK: yalnız o an MOUNT olan (aktif) ekran kaydedilmemiş veri
 * taşıyabilir. Bu modül dağınık `isDirty` kaynaklarını TEK bir kayda toplar —
 * üst çubuğun sekme değiştirme/kapatma onayı (başka görev) bu kayda sorar.
 *
 * İç durum DEĞİŞMEZDİR: her `set` çağrısı yeni bir `Map` üretir, var olanı
 * YERİNDE değiştirmez. Bildirim yalnız GERÇEK değişimde yapılır (aynı girdiyle
 * tekrar `set` çağrısı aboneleri tetiklemez) — `useSyncExternalStore` gereksiz
 * render'a düşmesin diye.
 */

export interface UnsavedEntry {
  /** Onay diyaloğunda gösterilecek kısa Türkçe ad (opsiyonel). */
  readonly label?: string;
}

export interface UnsavedRegistry {
  /** `entry` `null` verilirse kayıt silinir; aksi hâlde eklenir/güncellenir. */
  set(id: string, entry: UnsavedEntry | null): void;
  /** En az bir kayıtlı kaynak var mı. */
  hasUnsaved(): boolean;
  /** Kayıtlı kaynakların etiketleri, KAYIT SIRASIYLA. */
  labels(): readonly string[];
  /** Değişim aboneliği (`useSyncExternalStore` uyumlu). */
  subscribe(callback: () => void): () => void;
  /** `useSyncExternalStore` anlık görüntüsü — `hasUnsaved()` ile aynı değer. */
  getSnapshot(): boolean;
}

function sameEntry(a: UnsavedEntry | undefined, b: UnsavedEntry | null): boolean {
  if (a === undefined) return b === null;
  if (b === null) return false;
  return a.label === b.label;
}

export function createUnsavedRegistry(): UnsavedRegistry {
  let entries = new Map<string, UnsavedEntry>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    set(id, entry) {
      const current = entries.get(id);
      if (sameEntry(current, entry)) return;

      const next = new Map(entries);
      if (entry === null) {
        next.delete(id);
      } else {
        next.set(id, entry);
      }
      entries = next;
      notify();
    },
    hasUnsaved() {
      return entries.size > 0;
    },
    labels() {
      return [...entries.values()]
        .map((entry) => entry.label)
        .filter((label): label is string => label !== undefined);
    },
    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    getSnapshot() {
      return entries.size > 0;
    },
  };
}

/** Uygulama genelinde paylaşılan TEK kayıt. */
export const unsavedRegistry: UnsavedRegistry = createUnsavedRegistry();
