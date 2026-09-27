// @vitest-environment node
//
// SEKME-F1.3 · KAYDEDİLMEMİŞ DEĞİŞİKLİK ENVANTERİ BEKÇİSİ.
//
// Üst çubuktaki çalışma sekmeleri kaydedilmemiş veri varken sekme
// değiştirme/kapatma isteğinde onay soracak (o onay UI'ı başka görev).
// Onay yalnız `src/lib/workspace-tabs/unsaved-registry.ts`e SORAR — bu
// yüzden dağınık `isDirty` kaynaklarının merkezi kayda BAĞLI kalması
// yapısal bir zorunluluktur: biri sessizce kopar (ör. yeniden düzenlemede
// satır silinir/yorumlanır) ise sekme geçişi veri kaybını hiç fark etmez.
//
// Bekçi kaynak METNİNİ tarar (yorumlar soyulur) — `useUnsavedChanges(`
// çağrısının GERÇEKTEN kodda olduğunu doğrular, yorumdaki sahte referansı
// SAYMAZ (`use-client-directive-guard.test.ts`/`core-planning-import-guard.test.ts`
// deseni).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripComments } from "./_shared/strip-comments";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));

/**
 * SEKME-F1.3 emrindeki 10 kaynak + SEKME-F1.3b0 envanterinde bulunan 11.
 * kaynak (`DayLockBanner.tsx` iç `UnlockDayModal` — `<Modal isDirty=...>`
 * ile ZATEN fiilen bağlıydı, resmi listede yoktu; bu bir bekçi kör
 * noktasıydı, madde 9 gereği burada kapatıldı).
 */
const BOUND_SOURCES = [
  "components/timesheet/useTimesheetWeekEditor.ts",
  "components/site-planning/usePlanDraft.ts",
  "components/earned-value/settings/PlanningSettingsForm.tsx",
  "components/earned-value/diary/useAllocationDraft.ts",
  "components/earned-value/diary/DayLockBanner.tsx",
  "components/site-diary/SiteDiaryEntryView.tsx",
  "components/contracts/ContractDistributionView.tsx",
  "components/progress-payments/ProgressPaymentForm.tsx",
  "components/payroll/PayrollLineRow.tsx",
  "components/land-share-allocation/LandShareAllocationView.tsx",
  "components/settings/Modal.tsx",
];

const HOOK_CALL = /\buseUnsavedChanges\s*\(/;

describe("bekçinin kendisi", () => {
  it("yorumdaki sahte çağrıyı saymaz, koddakini görür", () => {
    const commented = "// useUnsavedChanges(true);\nconst x = 1;";
    expect(HOOK_CALL.test(stripComments(commented))).toBe(false);

    const real = 'useUnsavedChanges(isDirty, "Test");';
    expect(HOOK_CALL.test(stripComments(real))).toBe(true);
  });
});

describe("SEKME-F1.3 — kaydedilmemiş değişiklik kaynakları merkezi kayda bağlı", () => {
  it("envanter boş değil (bekçi boşa koşmuyor)", () => {
    expect(BOUND_SOURCES.length).toBeGreaterThan(0);
  });

  it.each(BOUND_SOURCES)("%s → useUnsavedChanges( çağırır (doğrudan ya da <Modal isDirty=)", (relativePath) => {
    const file = path.join(SRC_DIR, relativePath);
    const source = readFileSync(file, "utf8");
    const code = stripComments(source);
    const boundDirectly = HOOK_CALL.test(code);
    const boundViaModalIsDirty = /<Modal[^>]*\bisDirty\s*=/.test(code);
    expect(
      boundDirectly || boundViaModalIsDirty,
      `${relativePath} artık useUnsavedChanges(...) çağırmıyor ve <Modal isDirty=...> da geçmiyor — ` +
        `sekme onayı bu ekranın kaydedilmemiş verisini GÖREMEZ (kayıp sessiz olur).`,
    ).toBe(true);
  });
});
