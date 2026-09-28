// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createUnsavedRegistry } from "./unsaved-registry";

describe("createUnsavedRegistry", () => {
  it("set/sil: kayıt eklenir ve `null` ile silinir", () => {
    const registry = createUnsavedRegistry();
    expect(registry.hasUnsaved()).toBe(false);

    registry.set("a", { label: "Puantaj" });
    expect(registry.hasUnsaved()).toBe(true);

    registry.set("a", null);
    expect(registry.hasUnsaved()).toBe(false);
  });

  it("iki kaynaktan biri silinince kayıt HÂLÂ true kalır", () => {
    const registry = createUnsavedRegistry();
    registry.set("a", { label: "Puantaj" });
    registry.set("b", { label: "Günlük kayıt" });

    registry.set("a", null);

    expect(registry.hasUnsaved()).toBe(true);
    expect(registry.labels()).toEqual(["Günlük kayıt"]);
  });

  it("subscribe yalnız GERÇEK değişimde çağrılır (değişimsiz set sessizdir)", () => {
    const registry = createUnsavedRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);

    registry.set("a", { label: "Puantaj" });
    expect(listener).toHaveBeenCalledTimes(1);

    // Aynı içerikle tekrar set — değişim yok, bildirim de yok.
    registry.set("a", { label: "Puantaj" });
    expect(listener).toHaveBeenCalledTimes(1);

    // Olmayan bir kaydı silmeye çalışmak da değişim değildir.
    registry.set("c", null);
    expect(listener).toHaveBeenCalledTimes(1);

    registry.set("a", null);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe sonrası çağrılmaz", () => {
    const registry = createUnsavedRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    unsubscribe();

    registry.set("a", { label: "Puantaj" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("labels() KAYIT SIRASIYLA döner", () => {
    const registry = createUnsavedRegistry();
    registry.set("z", { label: "Üçüncü" });
    registry.set("a", { label: "Birinci" });
    registry.set("m", { label: "İkinci" });

    // Ekleme sırası korunur (Map ekleme sırasını korur) — alfabetik DEĞİL.
    expect(registry.labels()).toEqual(["Üçüncü", "Birinci", "İkinci"]);
  });

  it("etiketsiz girdiler labels()'ta yer almaz ama hasUnsaved()'ı etkiler", () => {
    const registry = createUnsavedRegistry();
    registry.set("a", {});
    expect(registry.hasUnsaved()).toBe(true);
    expect(registry.labels()).toEqual([]);
  });

  it("girdi nesnesi mutasyona uğramaz — çağıranın verdiği referans dokunulmadan kalır", () => {
    const registry = createUnsavedRegistry();
    const entry = { label: "Sözleşme" };
    const frozenCopy = { ...entry };
    registry.set("a", entry);
    registry.set("b", { label: "Bordro" });

    expect(entry).toEqual(frozenCopy);
  });

  it("getSnapshot() hasUnsaved() ile aynı değeri verir", () => {
    const registry = createUnsavedRegistry();
    expect(registry.getSnapshot()).toBe(registry.hasUnsaved());
    registry.set("a", { label: "Puantaj" });
    expect(registry.getSnapshot()).toBe(registry.hasUnsaved());
  });
});
