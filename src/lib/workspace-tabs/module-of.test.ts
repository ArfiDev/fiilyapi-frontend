import { describe, expect, it } from "vitest";

import { moduleOf } from "./module-of";

describe("moduleOf", () => {
  it("nav'daki EN UZUN önek eşleşmesini seçer (Çek & Ödeme, Hazine değil)", () => {
    expect(moduleOf("/hazine/cek-senet")).toEqual({
      key: "/hazine/cek-senet",
      rootHref: "/hazine/cek-senet",
      label: "Çek & Ödeme",
    });
  });

  it("kısa eşleşme yoksa üst modüle düşer", () => {
    expect(moduleOf("/hazine/baska")).toEqual({
      key: "/hazine",
      rootHref: "/hazine",
      label: "Hazine",
    });
  });

  it("iç içe dinamik segmentli şantiye rotası Projeler'e düşer", () => {
    const url = "/projeler/11111111-1111-1111-1111-111111111111/santiyeler/22222222-2222-2222-2222-222222222222";
    expect(moduleOf(url)).toEqual({
      key: "/projeler",
      rootHref: "/projeler",
      label: "Projeler",
    });
  });

  it("query dizesini yok sayar (yalnız pathname eşleşir)", () => {
    expect(moduleOf("/hazine/cek-senet?donem=2026-09")).toEqual({
      key: "/hazine/cek-senet",
      rootHref: "/hazine/cek-senet",
      label: "Çek & Ödeme",
    });
  });

  it("kök '/' Gösterge Paneli'dir", () => {
    expect(moduleOf("/")).toEqual({ key: "/", rootHref: "/", label: "Gösterge Paneli" });
  });

  it("nav'da karşılığı olmayan ama kırıntı ağacında kökü olan yol (Ayarlar) yedeğe düşer", () => {
    expect(moduleOf("/ayarlar/kullanicilar")).toEqual({
      key: "/ayarlar",
      rootHref: "/ayarlar",
      label: "Ayarlar",
    });
  });

  it("bilinmeyen slug (ComingSoon catch-all) başlık-case yedeğe düşer", () => {
    expect(moduleOf("/bilinmeyen-modul")).toEqual({
      key: "/bilinmeyen-modul",
      rootHref: "/bilinmeyen-modul",
      label: "Bilinmeyen Modul",
    });
  });
});
