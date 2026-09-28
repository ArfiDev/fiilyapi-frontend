"use client";

import { useEffect, useId, useSyncExternalStore } from "react";

import { unsavedRegistry } from "./unsaved-registry";

/**
 * SEKME-F1.3 · Ekranın kendi `isDirty` ifadesini merkezi kayda bağlar.
 *
 * Tek satırla kullanılır: `useUnsavedChanges(isDirty)`. Kimlik `useId` ile
 * kurulur (bileşen örneği başına benzersiz — satır bazlı kayıt için de
 * doğru: her `PayrollLineRow` kendi kimliğiyle kaydolur). `isDirty` `true`
 * iken kayıtlı kalır; `false` olunca VEYA bileşen UNMOUNT olunca silinir —
 * keep-alive yok, yalnız o an mount olan ekran kaydedilmemiş veri taşır.
 */
export function useUnsavedChanges(isDirty: boolean, label?: string): void {
  const id = useId();

  useEffect(() => {
    unsavedRegistry.set(id, isDirty ? { label } : null);
    return () => unsavedRegistry.set(id, null);
  }, [id, isDirty, label]);
}

/** Herhangi bir kayıtlı kaydedilmemiş değişiklik var mı (üst çubuk onayı için). */
export function useHasUnsavedChanges(): boolean {
  return useSyncExternalStore(
    unsavedRegistry.subscribe,
    unsavedRegistry.getSnapshot,
    () => false,
  );
}
