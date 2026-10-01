import { describe, expect, it } from "vitest";
import { beklemedeGorevler, kuyrukOzeti, siraliGorevler } from "./derive";
import type { Dilim, Durum, Gorev } from "./veri";

function gorev(kod: string, durum: Durum, dilimler: Dilim[] = []): Gorev {
  return { kod, acilim: kod, aciklama: "", durum, spec: "", dilimler, kararlar: [] };
}
function dilim(kod: string, hat: Dilim["hat"], durum: Durum): Dilim {
  return { kod, aciklama: "", hat, durum };
}

describe("siraliGorevler", () => {
  it("devam, sirada, sonra digerleri; esitlikte girdi sirasi korunur", () => {
    const girdi = [gorev("A", "bitti"), gorev("B", "sirada"), gorev("C", "beklemede"), gorev("D", "devam"), gorev("E", "sirada")];
    expect(siraliGorevler(girdi).map((g) => g.kod)).toEqual(["D", "B", "E", "C", "A"]);
  });
  it("girdi dizisini degistirmez", () => {
    const girdi = [gorev("A", "sirada"), gorev("B", "devam")];
    siraliGorevler(girdi);
    expect(girdi.map((g) => g.kod)).toEqual(["A", "B"]);
  });
  it("bos listede bos doner", () => {
    expect(siraliGorevler([])).toEqual([]);
  });
});

describe("kuyrukOzeti", () => {
  const gorevler = [
    gorev("X", "sirada", [dilim("B1", "backend", "sirada"), dilim("F1", "frontend", "sirada")]),
    gorev("Y", "devam", [dilim("B1", "backend", "devam"), dilim("F1", "frontend", "bitti")]),
    gorev("Z", "beklemede", [dilim("B1", "backend", "sirada")]),
  ];
  it("hat'a gore suzer, devam dilimi sirada dilimden once gelir", () => {
    expect(kuyrukOzeti(gorevler, "backend").map((s) => `${s.gorevKod}.${s.dilim.kod}`)).toEqual(["Y.B1", "X.B1"]);
  });
  it("bitti dilimi ve beklemede gorevin dilimini disarida birakir", () => {
    expect(kuyrukOzeti(gorevler, "frontend").map((s) => `${s.gorevKod}.${s.dilim.kod}`)).toEqual(["X.F1"]);
  });
  it("bos listede bos doner", () => {
    expect(kuyrukOzeti([], "backend")).toEqual([]);
  });
});

describe("beklemedeGorevler", () => {
  it("yalniz beklemede olanlari verir; yoksa bos", () => {
    expect(beklemedeGorevler([gorev("A", "beklemede"), gorev("B", "devam")]).map((g) => g.kod)).toEqual(["A"]);
    expect(beklemedeGorevler([gorev("B", "devam")])).toEqual([]);
  });
});
