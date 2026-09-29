import { describe, expect, it } from "vitest";
import { joinDisciplineNames, summarizeDisciplines } from "./disciplineSummary";

const d = (name: string, color = "#2563eb") => ({ name, color });

describe("joinDisciplineNames", () => {
  it("Türkçe birleştirme: A · A ve B · A, B ve C", () => {
    expect(joinDisciplineNames(["A"])).toBe("A");
    expect(joinDisciplineNames(["A", "B"])).toBe("A ve B");
    expect(joinDisciplineNames(["A", "B", "C"])).toBe("A, B ve C");
    expect(joinDisciplineNames(["A", "B", "C", "D"])).toBe("A, B, C ve D");
  });
});

describe("summarizeDisciplines", () => {
  it("atamasız (boş ya da alan yok) → Tümü (kısıtsız), nötr renk", () => {
    expect(summarizeDisciplines([])).toEqual({ label: "Tümü (kısıtsız)", color: null });
    expect(summarizeDisciplines(undefined).label).toBe("Tümü (kısıtsız)");
  });
  it("tek disiplin → adı ve KENDİ rengi", () => {
    expect(summarizeDisciplines([d("Civil Works", "#abcdef")])).toEqual({ label: "Civil Works", color: "#abcdef" });
  });
  it("çok disiplin → birleştirilmiş adlar, nötr renk", () => {
    expect(summarizeDisciplines([d("Civil Works"), d("Mekanik")])).toEqual({ label: "Civil Works ve Mekanik", color: null });
    expect(summarizeDisciplines([d("A"), d("B"), d("C")]).label).toBe("A, B ve C");
  });
});
