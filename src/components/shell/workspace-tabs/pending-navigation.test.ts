import { describe, expect, it } from "vitest";

import { createPendingNavigation, normalizeTabUrl, tabUrlOf } from "./pending-navigation";

const FOLLOW = { kind: "follow" };
const IGNORE = { kind: "ignore" };

describe("normalizeTabUrl — beklenen ile gözlenen AYNI biçimde karşılaştırılır", () => {
  it("query'yi URLSearchParams biçimine getirir (%20 → +)", () => {
    expect(normalizeTabUrl("/hazine?a=b%20c")).toBe("/hazine?a=b+c");
    expect(normalizeTabUrl("/hazine?a=b%20c")).toBe(tabUrlOf("/hazine", new URLSearchParams("a=b c").toString()));
  });

  it("sorgusuz yol ve Türkçe karakter", () => {
    expect(normalizeTabUrl("/projeler")).toBe("/projeler");
    expect(normalizeTabUrl("/projeler/köprü")).toBe("/projeler/k%C3%B6pr%C3%BC");
  });
});

describe("createPendingNavigation — sınıflama", () => {
  it("beklenen yokken her URL izlenir (bugünkü davranış)", () => {
    const nav = createPendingNavigation();
    expect(nav.observe("/projeler", "A")).toEqual(FOLLOW);
    expect(nav.currentUrl()).toBe("/projeler");
  });

  it("(a) beklenen URL gelince kayıt düşer; sonraki gezinme normal izlenir", () => {
    const nav = createPendingNavigation();
    nav.expect("B", "/hazine?x=b");
    expect(nav.isPendingFor("B")).toBe(true);
    expect(nav.observe("/hazine?x=b", "B")).toEqual(FOLLOW);
    expect(nav.isPendingFor("B")).toBe(false);
    expect(nav.observe("/hazine?x=c", "B")).toEqual(FOLLOW);
  });

  it("(a) normalleştirilmiş eşitlik: '%20' ile beklenen '+' ile gelirse vardık sayılır", () => {
    const nav = createPendingNavigation();
    nav.expect("B", "/hazine?a=b%20c");
    expect(nav.observe("/hazine?a=b+c", "B")).toEqual(FOLLOW);
    expect(nav.isPendingFor("B")).toBe(false);
  });

  it("aynı yol FARKLI query 'vardık' SAYILMAZ (aynı modülde iki sekme)", () => {
    const nav = createPendingNavigation();
    nav.expect("B", "/puantaj?site=2");
    expect(nav.observe("/puantaj?site=1&hafta=3", "B")).toEqual({ kind: "reassert", url: "/puantaj?site=2" });
  });

  it("(b) yerine yenisi konmuş beklenenin URL'si yok sayılır", () => {
    const nav = createPendingNavigation();
    nav.expect("B", "/hazine?x=b");
    nav.expect("C", "/puantaj?hafta=3");
    expect(nav.observe("/hazine?x=b", "C")).toEqual(IGNORE);
    expect(nav.observe("/puantaj?hafta=3", "C")).toEqual(FOLLOW);
  });

  it("(c) popstate işaretliyse kayıt düşer ve izlenir (Q5); işaret BİR KEZ tüketilir", () => {
    const nav = createPendingNavigation();
    nav.expect("B", "/hazine?x=b");
    nav.markPopstate();
    expect(nav.observe("/projeler/1", "B")).toEqual(FOLLOW);
    nav.expect("C", "/puantaj");
    expect(nav.observe("/projeler/2", "C")).toEqual({ kind: "reassert", url: "/puantaj" });
  });

  it("yeni beklenen eski bir popstate işaretini temizler", () => {
    const nav = createPendingNavigation();
    nav.markPopstate();
    nav.expect("B", "/hazine");
    expect(nav.observe("/projeler/1", "B")).toEqual({ kind: "reassert", url: "/hazine" });
  });

  it("(d) yabancı URL: ilk seferde yeniden dayat, ikinci yabancıda KABUL (tek-sefer sınırı)", () => {
    const nav = createPendingNavigation();
    nav.expect("B", "/hazine?x=b");
    expect(nav.observe("/projeler/1?q=x", "B")).toEqual({ kind: "reassert", url: "/hazine?x=b" });
    expect(nav.isPendingFor("B")).toBe(false); // dayatılmış kayıt "yolda" sayılmaz
    expect(nav.observe("/hazine/yeni", "B")).toEqual(FOLLOW);
    expect(nav.observe("/hazine/yeni/2", "B")).toEqual(FOLLOW); // kayıt düştü
  });

  it("savunma: beklenen sekme artık aktif değilse kayıt düşer, izlenir", () => {
    const nav = createPendingNavigation();
    nav.expect("B", "/hazine");
    expect(nav.observe("/projeler/1", "A")).toEqual(FOLLOW);
    expect(nav.isPendingFor("B")).toBe(false);
  });

  it("settle: push bulunulan adrese gidiyorsa önceki beklenen de düşer", () => {
    const nav = createPendingNavigation();
    nav.expect("B", "/hazine");
    nav.settle();
    expect(nav.isPendingFor("B")).toBe(false);
    expect(nav.observe("/projeler/1", "A")).toEqual(FOLLOW);
  });

  it("reset: iliştirmede her şey sıfırlanır, bulunulan adres kaydedilir", () => {
    const nav = createPendingNavigation();
    nav.expect("B", "/hazine");
    nav.markPopstate();
    nav.reset("/projeler");
    expect(nav.currentUrl()).toBe("/projeler");
    expect(nav.isPendingFor("B")).toBe(false);
    nav.expect("C", "/puantaj");
    expect(nav.observe("/x", "C")).toEqual({ kind: "reassert", url: "/puantaj" });
  });
});
