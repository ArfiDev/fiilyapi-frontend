import { describe, expect, it } from "vitest";

import { MSG_GROUP_NAME_TAKEN, isGroupNameTaken, nextGroupName } from "./offer-group-names";

const groups = (...names: string[]) => names.map((name, index) => ({ id: `g${index}`, name }));

describe("nextGroupName — '+ Grup' adı (SO-30: aynı ad dönüştürmede 422)", () => {
  it("çakışma yoksa 'Yeni grup'", () => {
    expect(nextGroupName([])).toBe("Yeni grup");
    expect(nextGroupName(groups("Kaba", "İnce"))).toBe("Yeni grup");
  });
  it("çakışmada 'Yeni grup 2', 3…; ilk boş sayı", () => {
    expect(nextGroupName(groups("Yeni grup"))).toBe("Yeni grup 2");
    expect(nextGroupName(groups("Yeni grup", "Yeni grup 2"))).toBe("Yeni grup 3");
    expect(nextGroupName(groups("Yeni grup", "Yeni grup 3"))).toBe("Yeni grup 2");
  });
  it("boşluk farkı çakışmayı gizlemez (kırpılmış karşılaştırma)", () => {
    expect(nextGroupName(groups("  Yeni grup "))).toBe("Yeni grup 2");
  });
});

describe("isGroupNameTaken — yeniden adlandırma korkuluğu", () => {
  it("başka grupta aynı ad → true; kendi adı → false; farklı ad → false", () => {
    const list = groups("A grubu", "B grubu");
    expect(isGroupNameTaken(list, "B grubu", "g0")).toBe(true);
    expect(isGroupNameTaken(list, " B grubu ", "g0")).toBe(true);
    expect(isGroupNameTaken(list, "B grubu", "g1")).toBe(false);
    expect(isGroupNameTaken(list, "C grubu", "g0")).toBe(false);
  });
  it("metin", () => {
    expect(MSG_GROUP_NAME_TAKEN).toBe("Bu adla grup var");
  });
});
