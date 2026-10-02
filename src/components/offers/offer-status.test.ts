import { describe, expect, it } from "vitest";

import { OFFER_CARD_STATUSES, OFFER_STATUSES, OFFER_STATUS_LABEL, OFFER_STATUS_TONE, isOfferExpired, istanbulToday } from "./offer-status";

describe("durum etiketi ve rengi (T31 + mockup TL:224)", () => {
  it("beş durum, T31 etiketleriyle ('Vazgeçildi')", () => {
    expect(OFFER_STATUSES).toEqual(["draft", "sent", "won", "lost", "withdrawn"]);
    expect(OFFER_STATUS_LABEL).toEqual({
      draft: "Taslak",
      sent: "Gönderildi",
      won: "Kazanıldı",
      lost: "Kaybedildi",
      withdrawn: "Vazgeçildi",
    });
  });

  it("renk tonu: Taslak slate · Gönderildi mavi · Kazanıldı yeşil · Kaybedildi kırmızı · Vazgeçildi koyu gri", () => {
    expect(OFFER_STATUS_TONE).toEqual({
      draft: "neutral",
      sent: "primary",
      won: "success",
      lost: "danger",
      withdrawn: "dark",
    });
  });

  it("kart olarak dört durum çizilir; Vazgeçildi kartı YOK (ÜS-F3-4)", () => {
    expect(OFFER_CARD_STATUSES).toEqual(["draft", "sent", "won", "lost"]);
  });
});

describe("istanbulToday", () => {
  it("21:00Z sonrası İstanbul'da ertesi gündür (UTC günü DEĞİL)", () => {
    expect(istanbulToday(new Date("2026-10-01T20:59:00Z"))).toBe("2026-10-01");
    expect(istanbulToday(new Date("2026-10-01T21:30:00Z"))).toBe("2026-10-02");
  });
});

describe("'süresi geçti' sınırı", () => {
  const today = "2026-10-02";

  it("bugün = hâlâ geçerli", () => {
    expect(isOfferExpired("sent", "2026-10-02", today)).toBe(false);
  });

  it("dün = süresi geçti", () => {
    expect(isOfferExpired("sent", "2026-10-01", today)).toBe(true);
  });

  it("yarın = geçerli", () => {
    expect(isOfferExpired("sent", "2026-10-03", today)).toBe(false);
  });

  it("yalnız gönderilmiş teklif için (taslak/kazanıldı/kaybedildi/vazgeçildi geçmiş tarihle de kırmızı OLMAZ)", () => {
    for (const status of ["draft", "won", "lost", "withdrawn"] as const) {
      expect(isOfferExpired(status, "2026-01-01", today), status).toBe(false);
    }
  });

  it("UTC 21:30 (İstanbul ertesi gün 00:30): geçerlilik 'UTC bugünü' ise İstanbul'a göre DÜN'dür → geçti", () => {
    const now = new Date("2026-10-01T21:30:00Z");
    expect(isOfferExpired("sent", "2026-10-01", istanbulToday(now))).toBe(true);
    expect(isOfferExpired("sent", "2026-10-02", istanbulToday(now))).toBe(false);
  });
});
