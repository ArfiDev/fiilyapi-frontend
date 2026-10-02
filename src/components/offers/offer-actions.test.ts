import { describe, expect, it } from "vitest";

import { OFFER_ACTIONS, offerActionGate, visibleActionReasons, type OfferAction } from "./offer-actions";
import type { OfferStatus } from "./offer-types";

/**
 * Plan §4.2 tablosu — HER HÜCRE açıkça yazılı (5 durum × 7 eylem × son/eski revizyon).
 * Sütun sırası: save, newRevision, send, win, lose, withdraw, edit.
 * ✔ = true. `draft` kirli/temiz iki satırdır (Taslak Kaydet ve Gönder kirliliğe bağlı).
 */
const LATEST_TABLE: ReadonlyArray<{
  label: string;
  status: OfferStatus;
  isDirty: boolean;
  expected: readonly [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
}> = [
  { label: "draft · temiz", status: "draft", isDirty: false, expected: [false, false, true, false, false, true, true] },
  { label: "draft · kirli", status: "draft", isDirty: true, expected: [true, false, false, false, false, false, true] },
  { label: "sent", status: "sent", isDirty: false, expected: [false, true, false, true, true, true, false] },
  { label: "won", status: "won", isDirty: false, expected: [false, false, false, false, false, false, false] },
  { label: "lost", status: "lost", isDirty: false, expected: [false, true, false, false, false, false, false] },
  { label: "withdrawn", status: "withdrawn", isDirty: false, expected: [false, false, false, false, false, false, false] },
];

const STATUSES: readonly OfferStatus[] = ["draft", "sent", "won", "lost", "withdrawn"];

function enabledMap(status: OfferStatus, isLatest: boolean, isDirty: boolean, canWrite = true) {
  const gate = offerActionGate({ status, isLatest, isDirty, canWrite });
  return OFFER_ACTIONS.map((action) => gate[action].enabled);
}

describe("eylem kapısı (§4.2) — SON revizyon", () => {
  for (const row of LATEST_TABLE) {
    it(`${row.label}: [save, newRevision, send, win, lose, withdraw, edit] = ${row.expected.join(",")}`, () => {
      expect(OFFER_ACTIONS).toEqual(["save", "newRevision", "send", "win", "lose", "withdraw", "edit"]);
      expect(enabledMap(row.status, true, row.isDirty)).toEqual([...row.expected]);
    });
  }
});

describe("🔴 F4.2 eylem kapısı — miktarsız kalem ekseni (ÜS-F4-17, SO-21)", () => {
  const UNQUANTIFIED = "Miktarı girilmemiş kalem var"; // backend 422 metni AYNEN

  it("taslakta unquantifiedCount > 0 → YALNIZ Gönder kapanır, gerekçe backend metni; diğer eylemler değişmez", () => {
    for (const isDirty of [false, true]) {
      const base = offerActionGate({ status: "draft", isLatest: true, isDirty, canWrite: true });
      const gate = offerActionGate({ status: "draft", isLatest: true, isDirty, canWrite: true, unquantifiedCount: 2 });
      expect(gate.send).toEqual({ enabled: false, reason: UNQUANTIFIED });
      for (const action of OFFER_ACTIONS.filter((candidate) => candidate !== "send")) {
        expect(gate[action], `${action} · dirty=${isDirty}`).toEqual(base[action]);
      }
    }
  });

  it("5 durum × son/eski × sayaç>0: kapı yalnız taslak-Gönder'de değişir (diğer her hücre sayaçsızla AYNI)", () => {
    for (const status of STATUSES) {
      for (const isLatest of [true, false]) {
        const base = offerActionGate({ status, isLatest, isDirty: false, canWrite: true });
        const gate = offerActionGate({ status, isLatest, isDirty: false, canWrite: true, unquantifiedCount: 1 });
        const changed = OFFER_ACTIONS.filter((action) => JSON.stringify(gate[action]) !== JSON.stringify(base[action]));
        expect(changed, `${status}/${isLatest ? "son" : "eski"}`).toEqual(status === "draft" && isLatest ? ["send"] : []);
      }
    }
  });

  it("sayaç 0 / yok → kapı DEĞİŞMEZ; yetkisiz ve eski revizyonda mevcut gerekçe korunur", () => {
    expect(offerActionGate({ status: "draft", isLatest: true, isDirty: false, canWrite: true, unquantifiedCount: 0 }).send.enabled).toBe(true);
    const readOnly = offerActionGate({ status: "draft", isLatest: true, isDirty: false, canWrite: false, unquantifiedCount: 3 });
    expect(readOnly.send).toEqual({ enabled: false, reason: "Teklifleri yalnız Sözleşmeler tam yetkisi değiştirir" });
  });

  it("gerekçe görünür listede (düğme altında) basılır", () => {
    const gate = offerActionGate({ status: "draft", isLatest: true, isDirty: false, canWrite: true, unquantifiedCount: 1 });
    expect(visibleActionReasons(gate)).toContain(UNQUANTIFIED);
  });
});

describe("eylem kapısı (§4.2) — ESKİ revizyon: 5 durum × 7 eylem HEPSİ kapalı", () => {
  for (const status of STATUSES) {
    for (const isDirty of [false, true]) {
      it(`${status} · ${isDirty ? "kirli" : "temiz"} → hiçbir eylem açık değil`, () => {
        expect(enabledMap(status, false, isDirty)).toEqual([false, false, false, false, false, false, false]);
      });
    }
  }
});

describe("eylem kapısı — yazma yetkisi yok", () => {
  for (const status of STATUSES) {
    it(`${status}: canWrite=false → hepsi kapalı + gerekçe`, () => {
      const gate = offerActionGate({ status, isLatest: true, isDirty: true, canWrite: false });
      for (const action of OFFER_ACTIONS) {
        const verdict = gate[action];
        expect(verdict.enabled).toBe(false);
        if (!verdict.enabled) expect(verdict.reason.length).toBeGreaterThan(0);
      }
    });
  }
});

describe("eylem kapısı — kalem yazım kuyruğu (TKL-F3.6.1 madde 4)", () => {
  const busy = (status: OfferStatus, isDirty = false) =>
    offerActionGate({ status, isLatest: true, isDirty, canWrite: true, isItemsBusy: true });

  it("🔴 taslakta kuyruk doluyken Gönder/Vazgeçildi KAPALI 'Kalem kaydediliyor'; Taslak Kaydet ve düzenleme etkilenmez", () => {
    const gate = busy("draft", true);
    for (const action of ["send", "withdraw"] as const) {
      const verdict = gate[action];
      expect(verdict.enabled).toBe(false);
      if (!verdict.enabled && action === "send") expect(verdict.reason).toBe("Önce taslağı kaydedin"); // mevcut gerekçe korunur
    }
    const clean = busy("draft");
    expect(clean.send).toEqual({ enabled: false, reason: "Kalem kaydediliyor" });
    expect(clean.withdraw).toEqual({ enabled: false, reason: "Kalem kaydediliyor" });
    expect(gate.save.enabled).toBe(true);
    expect(gate.edit.enabled).toBe(true);
  });

  it("gönderilmiş revizyonda da (kalem sırası sürüyorsa) kazan/kaybet/yeni revizyon kapanır", () => {
    const gate = busy("sent");
    for (const action of ["newRevision", "win", "lose", "withdraw"] as const) {
      expect(gate[action]).toEqual({ enabled: false, reason: "Kalem kaydediliyor" });
    }
  });

  it("kuyruk boşken (isItemsBusy yok/false) kapı DEĞİŞMEZ", () => {
    expect(offerActionGate({ status: "draft", isLatest: true, isDirty: false, canWrite: true }).send.enabled).toBe(true);
    expect(offerActionGate({ status: "draft", isLatest: true, isDirty: false, canWrite: true, isItemsBusy: false }).send.enabled).toBe(true);
  });
});

describe("eylem kapısı — gerekçeler (devre-dışı düğme title + görünür metin)", () => {
  function reasonOf(status: OfferStatus, action: OfferAction, isDirty = false): string {
    const verdict = offerActionGate({ status, isLatest: true, isDirty, canWrite: true })[action];
    if (verdict.enabled) throw new Error(`${status}/${action} açık, gerekçe beklenmedi`);
    return verdict.reason;
  }

  it("taslak: taslaktan doğrudan kazanıldı/kaybedildi YOK → önce gönderildi", () => {
    expect(reasonOf("draft", "win")).toBe("Önce gönderildi olarak işaretleyin");
    expect(reasonOf("draft", "lose")).toBe("Önce gönderildi olarak işaretleyin");
  });

  it("taslak kirliyken Gönder kapalı: önce taslağı kaydedin", () => {
    expect(reasonOf("draft", "send", true)).toBe("Önce taslağı kaydedin");
  });

  it("🔴 TKL-F3.6.1/2: taslak kirliyken Vazgeçildi de kapalı (kaydedilmemiş değer kapanışta kalmasın): önce taslağı kaydedin", () => {
    expect(reasonOf("draft", "withdraw", true)).toBe("Önce taslağı kaydedin");
  });

  it("taslakta yeni revizyon kapalı: gerekçe taslağın düzenlenebildiğini söyler", () => {
    expect(reasonOf("draft", "newRevision")).toBe(
      "Taslak revizyon düzenlenebilir; yeni revizyon gönderilen ya da kaybedilen teklife açılır",
    );
  });

  it("SO-1: vazgeçilene yeni revizyon YOK; kazanılana da YOK", () => {
    expect(reasonOf("withdrawn", "newRevision")).toMatch(/Vazgeçilen/);
    expect(reasonOf("won", "newRevision")).toMatch(/Kazanılan/);
  });
});
