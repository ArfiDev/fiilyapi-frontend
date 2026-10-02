import { describe, expect, it } from "vitest";

import { buildStatusCards, formatLiraFixed, listedTotals, rowMenuRules } from "./offer-list-model";
import { OFFER_DRAFT, OFFER_SENT, OFFER_WON, makeOffer, makeSummary } from "./offer-fixtures";

describe("formatLiraFixed", () => {
  it("her zaman iki kuruş hanesi, kayıpsız", () => {
    expect(formatLiraFixed("48750000.00")).toBe("₺48.750.000,00");
    expect(formatLiraFixed("128.8")).toBe("₺128,80");
    expect(formatLiraFixed("1234567890123456.07")).toBe("₺1.234.567.890.123.456,07");
    expect(formatLiraFixed("0")).toBe("₺0,00");
  });

  it("maskeli (null) → '—'", () => {
    expect(formatLiraFixed(null)).toBe("—");
  });
});

describe("listedTotals (Listelenen toplam)", () => {
  it("tam listede kayıpsız toplar", () => {
    const items = [makeOffer({ offer_no: "A", net: "0.10", gross: "0.12" }), makeOffer({ offer_no: "B", net: "0.20", gross: "0.24" })];
    expect(listedTotals(items, 2)).toEqual({ kind: "sum", net: "0.30", gross: "0.36" });
  });

  it("kırpılmış listede (total > items) Σ BASILMAZ", () => {
    expect(listedTotals([OFFER_DRAFT], 201)).toEqual({ kind: "truncated" });
  });

  it("maskeli satır varsa toplam bilinmez (null)", () => {
    const masked = makeOffer({ offer_no: "M", net: null, gross: null });
    expect(listedTotals([OFFER_DRAFT, masked], 2)).toEqual({ kind: "sum", net: null, gross: null });
  });
});

describe("buildStatusCards (TL:92-100)", () => {
  it("dört kart sayaç + tutarla; tutar yalnız Gönderildi/Kazanıldı'da", () => {
    const cards = buildStatusCards(makeSummary());
    expect(cards.map((c) => [c.status, c.count, c.showsAmount])).toEqual([
      ["draft", 2, false],
      ["sent", 3, true],
      ["won", 3, true],
      ["lost", 2, false],
    ]);
  });

  it("alt metinler: yalnız sunucu verisi varsa basılır", () => {
    const cards = buildStatusCards(makeSummary());
    const foot = (status: string) => cards.find((c) => c.status === status)!.foot;
    expect(foot("draft")).toBe("Gönderilmeyi bekliyor");
    expect(foot("sent")).toBe("2 teklifin geçerliliği doldu");
    expect(foot("won")).toBe("Kazanma oranı %60 · karara bağlanan 5 tekliften");
    expect(foot("lost")).toBe("");
  });

  it("süresi geçen yoksa Gönderildi alt metni boş; karar yoksa kazanma oranı basılmaz", () => {
    const cards = buildStatusCards(makeSummary({ expired_count: 0, win_rate: null }));
    expect(cards.find((c) => c.status === "sent")!.foot).toBe("");
    expect(cards.find((c) => c.status === "won")!.foot).toBe("");
  });

  it("eksik durum satırı → 0 adet", () => {
    const cards = buildStatusCards(makeSummary({ by_status: [] }));
    expect(cards.map((c) => c.count)).toEqual([0, 0, 0, 0]);
  });
});

describe("rowMenuRules (⋯ menüsü)", () => {
  it("yeni revizyon YALNIZ gönderilmiş/kaybedilmiş son revizyonda açık", () => {
    const enabled = (status: "draft" | "sent" | "won" | "lost" | "withdrawn") =>
      rowMenuRules({ status, rev_no: 1 }, true).newRevision.enabled;
    expect(enabled("draft")).toBe(false);
    expect(enabled("sent")).toBe(true);
    expect(enabled("won")).toBe(false);
    expect(enabled("lost")).toBe(true);
    expect(enabled("withdrawn")).toBe(false);
  });

  it("kapalıyken gerekçe taşır; yazma yetkisi yoksa yetki gerekçesi", () => {
    expect(rowMenuRules(OFFER_DRAFT, true).newRevision.reason).toBe(
      "Taslak revizyon düzenlenebilir; yeni revizyon gönderilen ya da kaybedilen teklife açılır",
    );
    expect(rowMenuRules(OFFER_SENT, false)).toMatchObject({
      newRevision: { enabled: false, reason: "Teklifleri yalnız Sözleşmeler tam yetkisi değiştirir" },
      canDelete: false,
    });
    expect(rowMenuRules(OFFER_SENT, true).newRevision.reason).toBeNull();
  });

  it("'Taslağı sil' yalnız TEK revizyonlu taslakta (rev 0 + draft) ve yazma yetkisiyle", () => {
    expect(rowMenuRules({ status: "draft", rev_no: 0 }, true).canDelete).toBe(true);
    expect(rowMenuRules({ status: "draft", rev_no: 1 }, true).canDelete).toBe(false);
    expect(rowMenuRules({ status: "sent", rev_no: 0 }, true).canDelete).toBe(false);
    expect(rowMenuRules(OFFER_WON, true).canDelete).toBe(false);
    expect(rowMenuRules({ status: "draft", rev_no: 0 }, false).canDelete).toBe(false);
  });
});
