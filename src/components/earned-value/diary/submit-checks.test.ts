import { describe, expect, it } from "vitest";

import type { EvSubmitCheck } from "@/lib/api/models";

import { buildSubmitState, reasonKind, resolveAllocationAccess, type SubmitInput } from "./submit-checks";

const QTY = { code: "no_quantity", message: "Miktar girilmedi" };
const WEATHER = { code: "weather_incomplete", message: "Hava bilgisi eksik (durum, min/max sıcaklık, rüzgâr)" };
const HOURS = { code: "undistributed_hours", message: "16 a-s dağıtılmamış; gerekçe gerekli" };
const OVERRUN = { code: "overrun_without_reason", message: "Planlı miktarı aşan satır gerekçesiz" };
const NO_PERMISSION = {
  code: "no_planning_permission",
  message: "Günlüğü göndermek planlama yazma yetkisi ister (formen gönderemez)",
};

/** Backend 422/gün yanıtı: `reasons` (metin) + `reason_items` (kod) — EV-BORC-2 kapandı. */
function withReasons(...items: { code: string; message: string }[]): EvSubmitCheck {
  return { can_submit: items.length === 0, reasons: items.map((item) => item.message), reason_items: items };
}

function input(overrides: Partial<SubmitInput> = {}): SubmitInput {
  return {
    submit: { can_submit: true, reasons: [] },
    unallocated: 0,
    reason: "",
    isDirty: false,
    isLocked: false,
    isForeman: false,
    ...overrides,
  };
}

describe("buildSubmitState — Gönder kontrol çubuğu (İ:493-510) + submitGate", () => {
  it("backend izin verir, taslak temiz → kapı açık, üç çip yeşil, 'Gönderime hazır'", () => {
    const state = buildSubmitState(input());
    expect(state.gate).toEqual({ canSubmit: true, reasons: [], showReasonsInCore: false });
    expect(state.checks.map((c) => [c.label, c.tone])).toEqual([
      ["Miktarlar girildi", "ok"],
      ["Bütün saatler dağıtıldı", "ok"],
      ["Hava girildi", "ok"],
    ]);
    expect(state.note).toEqual({ text: "Gönderime hazır", tone: "ok" });
  });

  it("backend 'can_submit: false' ise kapı KAPALI ve gerekçeler backend'in (tek kaynak)", () => {
    const reasons = [QTY.message, WEATHER.message];
    const state = buildSubmitState(input({ submit: withReasons(QTY, WEATHER) }));
    expect(state.gate).toEqual({ canSubmit: false, reasons, showReasonsInCore: false });
    expect(state.checks.map((c) => [c.label, c.tone])).toEqual([
      ["Miktar girilmedi", "warn"],
      ["Bütün saatler dağıtıldı", "ok"],
      ["Hava eksik", "warn"],
    ]);
  });

  it("dağıtılmamış saat: gerekçe yoksa 'gerekçe yaz' bağlantısı, varsa 'gerekçe yazıldı'", () => {
    const blocked = buildSubmitState(
      input({ unallocated: 1600, submit: withReasons(HOURS) }),
    );
    expect(blocked.checks[1]).toEqual({
      key: "hours",
      tone: "warn",
      label: "16 a-s dağıtılmamış · gönderim engelli",
      canWriteReason: true,
    });
    expect(blocked.note).toEqual({ text: "Dağıtılmamış saat gönderimi engelliyor", tone: "warn" });
    const reasoned = buildSubmitState(input({ unallocated: -250, reason: "temizlik" }));
    expect(reasoned.checks[1].label).toBe("2,5 a-s fazla dağıtılmış · gerekçe yazıldı");
    expect(reasoned.checks[1].canWriteReason).toBe(false);
    expect(reasoned.note).toEqual({ text: "Gerekçeyle gönderilebilir", tone: "ok" });
  });

  it("kirli taslak kapıyı KAPATMAZ (Kaydet & Gönder önce dağıtımı yazar, S1); saat gerekçesi önizlemeden", () => {
    const backendHours = withReasons(HOURS);
    // Taslakta gerekçe yazıldı → backend'in (kaydedilmiş hâle ait) saat gerekçesi düşer.
    expect(buildSubmitState(input({ isDirty: true, unallocated: 1600, reason: "temizlik", submit: backendHours })).gate).toEqual({
      canSubmit: true,
      reasons: [],
      showReasonsInCore: false,
    });
    // Taslakta dağıtılmamış var ve gerekçe yok → önizleme gerekçesiyle kapalı.
    expect(buildSubmitState(input({ isDirty: true, unallocated: 250 })).gate).toEqual({
      canSubmit: false,
      reasons: ["2,5 a-s dağıtılmamış; gerekçe gerekli"],
      showReasonsInCore: false,
    });
    // Saat dışı backend gerekçesi kirlilikte de korunur.
    const weather = withReasons(WEATHER);
    expect(buildSubmitState(input({ isDirty: true, submit: weather })).gate?.canSubmit).toBe(false);
  });

  it("kilitli gün ve formen notları (İ:728)", () => {
    expect(buildSubmitState(input({ isLocked: true })).note.text).toBe("Gün kilitli");
    expect(buildSubmitState(input({ isLocked: true })).gate?.canSubmit).toBe(false);
    const foreman = buildSubmitState(
      input({ isForeman: true, submit: withReasons(NO_PERMISSION) }),
    );
    expect(foreman.note.text).toBe("Gönderim mühendiste");
    expect(foreman.checks.at(-1)).toMatchObject({ tone: "warn", label: NO_PERMISSION.message });
  });

  it("kayıt yokken (submit null) kapı verilmez — çekirdek bugünkü gibi", () => {
    expect(buildSubmitState(input({ submit: null })).gate).toBeNull();
  });
});

describe("buildSubmitState — kısıtlı kullanıcıda iki aşım maddesi (DSC-B2: önce kendi, sonra opak 'Başka disiplinde')", () => {
  const OTHER = { code: "overrun_without_reason", message: "Başka disiplinde 2 satır planlı miktarı aşıyor (gerekçesiz)" };

  it("iki overrun_without_reason → iki uyarı çipi, backend metni AYNEN, sıra korunur, anahtarlar benzersiz", () => {
    const state = buildSubmitState(input({ submit: withReasons(OVERRUN, OTHER) }));
    expect(state.checks.map((c) => [c.key, c.tone, c.label])).toEqual([
      ["quantity", "warn", OVERRUN.message],
      ["quantity-1", "warn", OTHER.message],
      ["hours", "ok", "Bütün saatler dağıtıldı"],
      ["weather", "ok", "Hava girildi"],
    ]);
  });

  it("gate iki metni de taşır (sıra: kendi, sonra başka) ve kapı kapalı", () => {
    const state = buildSubmitState(input({ submit: withReasons(OVERRUN, OTHER) }));
    expect(state.gate).toEqual({ canSubmit: false, reasons: [OVERRUN.message, OTHER.message], showReasonsInCore: false });
    expect(state.note).toEqual({ text: "Aşım gerekçesi gönderimi engelliyor", tone: "warn" });
  });

  it("yalnız opak madde (kendi aşımı yok) tek uyarı çipi olur", () => {
    const state = buildSubmitState(input({ submit: withReasons(OTHER) }));
    expect(state.checks[0]).toMatchObject({ key: "quantity", tone: "warn", label: OTHER.message });
    expect(state.checks.filter((c) => c.key.startsWith("quantity"))).toHaveLength(1);
  });

  it("madde yoksa mevcut yeşil 'Miktarlar girildi' çipi", () => {
    expect(buildSubmitState(input()).checks[0]).toMatchObject({ key: "quantity", tone: "ok", label: "Miktarlar girildi" });
  });
});

describe("reasonKind — backend gerekçe KODU → çip türü (EV-BORC-2 kapandı, `reason_items`; metne bakılmaz)", () => {
  it.each([
    ["no_quantity", "quantity"],
    ["overrun_without_reason", "overrun"],
    ["weather_incomplete", "weather"],
    ["undistributed_hours", "hours"],
    ["no_planning_permission", "other"],
    ["unspecified", "other"],
    ["ileride_eklenecek_kod", "other"],
    ["constructor", "other"],
  ])("%s → %s", (code, kind) => {
    expect(reasonKind(code)).toBe(kind);
  });

  it("sınıflandırma KODA bakar: metni tanınmayan ama kodu bilinen gerekçe doğru çipe düşer", () => {
    const state = buildSubmitState(input({ submit: withReasons({ code: "weather_incomplete", message: "Rüzgâr yok" }) }));
    expect(state.checks.map((c) => [c.key, c.tone])).toEqual([
      ["quantity", "ok"],
      ["hours", "ok"],
      ["weather", "warn"],
    ]);
  });

  it("bilinmeyen kod KAYBOLMAZ: kendi metniyle ayrı uyarı çipi olur ve kapıyı kapatır", () => {
    const state = buildSubmitState(input({ submit: withReasons({ code: "yeni_kural", message: "Yeni kural engelliyor" }) }));
    expect(state.checks.at(-1)).toMatchObject({ tone: "warn", label: "Yeni kural engelliyor" });
    expect(state.gate).toEqual({ canSubmit: false, reasons: ["Yeni kural engelliyor"], showReasonsInCore: false });
  });

  it("`reason_items` yoksa (eski yanıt) metinler kaybolmaz — hepsi ayrı uyarı çipi", () => {
    const state = buildSubmitState(input({ submit: { can_submit: false, reasons: ["Miktar girilmedi"] } }));
    expect(state.checks.map((c) => [c.label, c.tone])).toEqual([
      ["Miktarlar girildi", "ok"],
      ["Bütün saatler dağıtıldı", "ok"],
      ["Hava girildi", "ok"],
      ["Miktar girilmedi", "warn"],
    ]);
    expect(state.gate?.canSubmit).toBe(false);
  });

  it("aşım notu koddan: 'Aşım gerekçesi gönderimi engelliyor'", () => {
    expect(buildSubmitState(input({ submit: withReasons(OVERRUN) })).note).toEqual({
      text: "Aşım gerekçesi gönderimi engelliyor",
      tone: "warn",
    });
  });
});

describe("resolveAllocationAccess — rol (K17) + kilit + tamamlanmış şantiye", () => {
  it("dağıtım yazma kapısı açıksa düzenler; kapalıysa (formen) salt okur ve formen bandı görür", () => {
    expect(resolveAllocationAccess({ canWriteAllocation: true, canUnlockDay: false, diaryCanWrite: true, isLocked: false, isSiteCompleted: false })).toEqual({
      canEdit: true,
      readOnlyText: null,
      isForeman: false,
      showForemanBand: false,
      canUnlock: false,
    });
    expect(resolveAllocationAccess({ canWriteAllocation: false, canUnlockDay: false, diaryCanWrite: true, isLocked: false, isSiteCompleted: false })).toMatchObject({
      canEdit: false,
      readOnlyText: "Saat Dağıtımı mühendis tarafından yapılır",
      isForeman: true,
      showForemanBand: true,
    });
  });

  it("kilitli gün: yetkili bile düzenleyemez; approve kilidi açabilir", () => {
    expect(resolveAllocationAccess({ canWriteAllocation: true, canUnlockDay: true, diaryCanWrite: true, isLocked: true, isSiteCompleted: false })).toMatchObject({
      canEdit: false,
      readOnlyText: "gün kilitli",
      canUnlock: true,
    });
  });

  it("tamamlanmış şantiye: salt okunur, kilit açılamaz", () => {
    expect(resolveAllocationAccess({ canWriteAllocation: true, canUnlockDay: true, diaryCanWrite: true, isLocked: false, isSiteCompleted: true })).toMatchObject({
      canEdit: false,
      readOnlyText: "şantiye tamamlandı",
      canUnlock: false,
    });
  });
});
