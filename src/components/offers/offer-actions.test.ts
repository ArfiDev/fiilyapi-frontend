import { describe, expect, it } from "vitest";

import { OFFER_ACTIONS, offerActionGate, type OfferAction } from "./offer-actions";
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
  { label: "draft · kirli", status: "draft", isDirty: true, expected: [true, false, false, false, false, true, true] },
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
