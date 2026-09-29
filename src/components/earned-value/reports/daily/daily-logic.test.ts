import { describe, expect, it } from "vitest";

import {
  approveGate,
  formatDayMonthDots,
  formatReportDateHeader,
  formatToleranceLabel,
  formatWeekRangeDots,
  isTrendHidden,
  trendTitle,
  joinWithVe,
  directTotalLabel,
  kpiRowLabel,
  otherDisciplineHours,
  reconciliationText,
  reportEyebrow,
  reportNoLabel,
  versionSuffix,
} from "./daily-logic";

describe("approveGate — GİR onay düğmesi (S10, S12)", () => {
  it("APPROVE izni yoksa düğme görünmez", () => {
    expect(approveGate({ level: "view", siteCompleted: false, status: "draft", draftDiaryDates: [] })).toEqual({
      visible: false,
      disabled: false,
      reason: null,
    });
  });

  it("tamamlanmış şantiyede düğme görünmez (izin olsa bile)", () => {
    expect(approveGate({ level: "admin", siteCompleted: true, status: "draft", draftDiaryDates: [] }).visible).toBe(false);
  });

  it("rapor zaten onaylıysa düğme görünmez", () => {
    expect(approveGate({ level: "approve", siteCompleted: false, status: "approved", draftDiaryDates: [] }).visible).toBe(false);
  });

  it("rapor üretilemediyse (not_generated) düğme görünmez", () => {
    expect(approveGate({ level: "admin", siteCompleted: false, status: "not_generated", draftDiaryDates: [] }).visible).toBe(false);
  });

  it("S10: taslak günlük VARKEN düğme görünür ama PASİF, neden verilir", () => {
    const gate = approveGate({ level: "approve", siteCompleted: false, status: "draft", draftDiaryDates: ["2026-09-21"] });
    expect(gate.visible).toBe(true);
    expect(gate.disabled).toBe(true);
    expect(gate.reason).not.toBeNull();
  });

  it("S12: taslak günlük YOKKEN — bugün olmasa da — düğme etkin", () => {
    const gate = approveGate({ level: "approve", siteCompleted: false, status: "draft", draftDiaryDates: [] });
    expect(gate).toEqual({ visible: true, disabled: false, reason: null });
  });

  it("admin de en az approve sayılır (hasAtLeast artan sıra)", () => {
    expect(approveGate({ level: "admin", siteCompleted: false, status: "draft", draftDiaryDates: [] }).visible).toBe(true);
  });
});

describe("reportNoLabel — S13 'GİR-0142'", () => {
  it("4 haneye sıfırla doldurur", () => {
    expect(reportNoLabel(142)).toBe("GİR-0142");
  });
  it("null → boş yer tutucu", () => {
    expect(reportNoLabel(null)).toBe("GİR-—");
  });
  it("4 haneden büyük sayı kesilmez", () => {
    expect(reportNoLabel(12345)).toBe("GİR-12345");
  });
});

describe("versionSuffix — S13 '· sürüm n'", () => {
  it("onaylı + versiyon varsa ek yapılır", () => {
    expect(versionSuffix("approved", 2)).toBe(" · sürüm 2");
  });
  it("taslakta ek YOK", () => {
    expect(versionSuffix("draft", 2)).toBe("");
  });
  it("onaylı ama versiyon null ise ek YOK", () => {
    expect(versionSuffix("approved", null)).toBe("");
  });
});

describe("reportEyebrow — GİR:148 başlık 'firma · proje · şantiye'", () => {
  it("üçü de doluysa ' · ' ile birleşir", () => {
    expect(reportEyebrow("FİİL Yapı", "Güneşkent Konut", "A-Blok Şantiyesi")).toBe(
      "FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi",
    );
  });

  it("boş firma ATLANIR, ayraç kaymaz", () => {
    expect(reportEyebrow("", "Güneşkent Konut", "A-Blok Şantiyesi")).toBe("Güneşkent Konut · A-Blok Şantiyesi");
  });

  it("boş proje ATLANIR (ortadaki boşluk)", () => {
    expect(reportEyebrow("FİİL Yapı", "", "A-Blok Şantiyesi")).toBe("FİİL Yapı · A-Blok Şantiyesi");
  });

  it("boş şantiye ATLANIR (sondaki boşluk)", () => {
    expect(reportEyebrow("FİİL Yapı", "Güneşkent Konut", "")).toBe("FİİL Yapı · Güneşkent Konut");
  });

  it("üçü de boşsa boş dize döner", () => {
    expect(reportEyebrow("", "", "")).toBe("");
  });

  it("yalnız boşluklardan oluşan parça da boş sayılır", () => {
    expect(reportEyebrow("  ", "Güneşkent Konut", "A-Blok Şantiyesi")).toBe("Güneşkent Konut · A-Blok Şantiyesi");
  });
});

describe("formatDayMonthDots — 'gg.aa' yılsız (GİR:112,169)", () => {
  it("2026-09-24 → '24.09'", () => {
    expect(formatDayMonthDots("2026-09-24")).toBe("24.09");
  });
  it("ayrıştırılamayan girdi aynen döner", () => {
    expect(formatDayMonthDots("bozuk")).toBe("bozuk");
  });
});

describe("formatReportDateHeader — GİR:150 'gg.aa.yyyy Haftagünü'", () => {
  it("2026-09-24 (Perşembe) → '24.09.2026 Perşembe'", () => {
    expect(formatReportDateHeader("2026-09-24")).toBe("24.09.2026 Perşembe");
  });
  it("2026-09-22 (Salı) → '22.09.2026 Salı'", () => {
    expect(formatReportDateHeader("2026-09-22")).toBe("22.09.2026 Salı");
  });
});

describe("formatWeekRangeDots — GİR:150 '18–24.09'", () => {
  it("aynı ay → 'gg–gg.aa'", () => {
    expect(formatWeekRangeDots("2026-09-18", "2026-09-24")).toBe("18–24.09");
  });
  it("farklı ay → her iki uç kendi 'gg.aa'sı", () => {
    expect(formatWeekRangeDots("2026-08-30", "2026-09-05")).toBe("30.08–05.09");
  });
});

describe("joinWithVe — Türkçe 've' bağlacı (GİR:112)", () => {
  it("iki öğe → 'X ve Y'", () => {
    expect(joinWithVe(["21.09", "23.09"])).toBe("21.09 ve 23.09");
  });
  it("üç öğe → 'X, Y ve Z'", () => {
    expect(joinWithVe(["21.09", "22.09", "23.09"])).toBe("21.09, 22.09 ve 23.09");
  });
  it("tek öğe → aynen döner", () => {
    expect(joinWithVe(["21.09"])).toBe("21.09");
  });
  it("boş liste → boş dize", () => {
    expect(joinWithVe([])).toBe("");
  });
});

describe("formatToleranceLabel — F3.6b lider denetimi (4. tur): GİR:169 'tolerans ±2,0 puan'", () => {
  it("PUAN ölçeğinde girer, ×100 YAPILMAZ: '2.0' → '2,0' (formatVariancePoints'in 200,0 hatası burada)", () => {
    expect(formatToleranceLabel("2.0")).toBe("2,0");
  });
  it("tam sayı girse bile 1 ondalık BASILIR: '2' → '2,0'", () => {
    expect(formatToleranceLabel("2")).toBe("2,0");
  });
  it("null → EMPTY_CELL", () => {
    expect(formatToleranceLabel(null)).toBe("—");
  });
  it("Lider denetimi (8. tur) — ondalık kanonu: Number'ın YANILDIĞI sınır — '2.049999999999999999' → '2,0' (eski `Intl.NumberFormat(Number(...))` '2,1' derdi: fazla basamak Number'da 2.05'e yuvarlanır)", () => {
    // Doğrulandı: eski gövde (Intl.NumberFormat + Number) bu girdide "2,1" üretiyordu
    // (Number() 19 basamaklı dizeyi en yakın double'a — pratikte 2.05'e — yuvarlıyor).
    expect(formatToleranceLabel("2.049999999999999999")).toBe("2,0");
  });
});

describe("kpiRowLabel — Genel satır etiketleri `kind`'dan (GİR:462-464; backend overall `name`ini null döner)", () => {
  it.each([
    ["overall", "Genel"],
    ["overall_own", "Genel – Kendi"],
    ["overall_subcon", "Genel – Taşeron"],
  ] as const)("%s (name null) → %s", (kind, label) => {
    expect(kpiRowLabel({ kind, name: null })).toBe(label);
  });

  it("disiplin satırı backend adını korur; adı yoksa boş hücre", () => {
    expect(kpiRowLabel({ kind: "discipline", name: "Kaba İnşaat" })).toBe("Kaba İnşaat");
    expect(kpiRowLabel({ kind: "discipline", name: null })).toBe("—");
  });

  it("overall satırında backend adı GELSE BİLE etiket kind'dan üretilir (tek kaynak)", () => {
    expect(kpiRowLabel({ kind: "overall", name: "başka" })).toBe("Genel");
  });
});

describe("kpiRowLabel — kısıtlı kullanıcı (DSC-B3 S1: yalnız overall satırı 'Genel (disiplinlerim)')", () => {
  it("kısıtlıda yalnız overall değişir; overall_own / overall_subcon / disiplin AYNI", () => {
    expect(kpiRowLabel({ kind: "overall", name: null }, true)).toBe("Genel (disiplinlerim)");
    expect(kpiRowLabel({ kind: "overall_own", name: null }, true)).toBe("Genel – Kendi");
    expect(kpiRowLabel({ kind: "overall_subcon", name: null }, true)).toBe("Genel – Taşeron");
    expect(kpiRowLabel({ kind: "discipline", name: "Civil" }, true)).toBe("Civil");
  });

  it("kısıtsızda (varsayılan) 'Genel' aynen", () => {
    expect(kpiRowLabel({ kind: "overall", name: null })).toBe("Genel");
    expect(kpiRowLabel({ kind: "overall", name: null }, false)).toBe("Genel");
  });
});

describe("directTotalLabel", () => {
  it("kısıtlıda '(disiplinlerim)' eki, kısıtsızda bugünkü metin", () => {
    expect(directTotalLabel(true)).toBe("Toplam doğrudan (disiplinlerim)");
    expect(directTotalLabel(false)).toBe("Toplam doğrudan");
  });
});

describe("otherDisciplineHours / reconciliationText — Σ harcanan + dağıtılmamış (+ başka disiplinde) = Σ puantaj", () => {
  const footer = (spent: string, undist: string, total: string) => ({ spent_total_day: spent, undistributed_day: undist, timesheet_total_day: total });

  it("H = T − U − harcanan (ondalık string aritmetiği)", () => {
    expect(otherDisciplineHours(footer("200", "16", "326"))).toBe("110");
    expect(otherDisciplineHours(footer("0.1", "0.2", "0.6"))).toBe("0.3");
  });

  it("H negatif olamaz (max 0)", () => {
    expect(otherDisciplineHours(footer("320", "16", "326"))).toBe("0");
  });

  it("kısıtsız: bugünkü metin AYNEN (H terimi yok)", () => {
    expect(reconciliationText(footer("310", "16", "326"), false)).toBe("Σ harcanan 310 a-s + dağıtılmamış 16 a-s = Σ puantaj 326 a-s");
  });

  it("kısıtlı: H terimi eklenir", () => {
    expect(reconciliationText(footer("200", "16", "326"), true)).toBe(
      "Σ harcanan 200 a-s + dağıtılmamış 16 a-s + başka disiplinde 110 a-s = Σ puantaj 326 a-s",
    );
  });
});

describe("isTrendHidden — yalnız kısıtlı + boş trend", () => {
  it.each([
    [true, 0, true],
    [true, 7, false],
    [false, 0, false],
    [false, 7, false],
  ])("kısıtlı=%s trend=%i → gizli=%s", (restricted, count, hidden) => {
    const trend = Array.from({ length: count }) as never;
    expect(isTrendHidden({ trend }, restricted)).toBe(hidden);
  });
});

describe("kpiRowLabel — non_direct (Panel S32 metni, backend name null döner)", () => {
  it("non_direct satırı 'Genel / Dolaylı · bütçe dışı'; kısıtlıda ek YOK", () => {
    expect(kpiRowLabel({ kind: "non_direct", name: null })).toBe("Genel / Dolaylı · bütçe dışı");
    expect(kpiRowLabel({ kind: "non_direct", name: null }, true)).toBe("Genel / Dolaylı · bütçe dışı");
  });
});

describe("trendTitle — kısıtlı canlı raporda '(disiplinlerim)' eki", () => {
  it("atamasızda başlık bugünkü metin, kısıtlıda ek", () => {
    expect(trendTitle(false)).toBe("2 · 7 günlük trend · Genel kümülatif");
    expect(trendTitle(true)).toBe("2 · 7 günlük trend · Genel kümülatif (disiplinlerim)");
  });
});
