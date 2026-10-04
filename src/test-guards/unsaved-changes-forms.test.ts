// @vitest-environment node
//
// SEKME-F1.3b · KAYDEDİLMEMİŞ-DEĞİŞİKLİK BAĞLAMA BEKÇİSİ (form taraması).
// F1.3b sonunda (üç küme de bağlandı) `PENDING_BINDING_SET` boşaldı ve kaldırıldı.
//
// `unsaved-changes-inventory.test.ts` sabit 11 kaynağı doğrular. Bu bekçi
// KAPSAMI GENİŞLETİR: `src/components/**/*.tsx` + `src/app/**/*.tsx` altında
// "girdi yüzeyi ∧ kayıt niyeti" taşıyan her dosyanın (aday) merkezi kayda
// (doğrudan `useUnsavedChanges(` YA DA `<Modal isDirty=...>`) bağlı olduğunu
// doğrular — ya da `EXEMPT` sözlüğünde gerekçeli bir muafiyeti vardır.
//
// Kural kaynağı: SEKME-F1.3b.0 envanteri (§1 "Nihai kural", §6 "Bekçi
// önerisi"). Desen: `use-client-directive-guard.test.ts` (dinamik tarama +
// istisna Seti) ve `unsaved-changes-inventory.test.ts` (yorum-soyma).
//
// 🔴 BİLİNEN KÖR NOKTA — DÜZELTİLDİ (SEKME-F1.3b ek tur): "kayıt niyeti"
// (CANDIDATE_B) yalnız `useMutation`/`.mutate(`/`.mutateAsync(`/`onSubmit`
// arıyordu. Bu, mutasyonu KENDİSİ ÇAĞIRMAYAN, ebeveynden `onSave*`/`onSubmit*`
// gibi bir geri çağrı PROP'u alan SAF form gövdelerini KAÇIRIYORDU —
// `EmployerContractItemsTable.tsx` (`onSubmitNewRow`) ve
// `RentalLinesTable.tsx` (`onSaveLine`) ÖLÇÜLDÜ: ikisi de `useMutation`
// çağırmıyor, tek `.mutate(` bile yok, ama gerçek form gövdesi taşıyorlar.
// Genişletilmiş taramada (`on(Save|Submit)\w*` prop deseni) YALNIZ bu iki
// dosya YENİ aday çıktı — ikisi de zaten bu turda bağlanmış GERÇEK formlar,
// sahte aday YOK (0/2). Eşik (~10 sahte aday) aşılmadığı için kural
// KALICI OLARAK GENİŞLETİLDİ (aşağıdaki `CANDIDATE_B`).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripComments } from "./_shared/strip-comments";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));

const SCAN_ROOTS = ["components", "app"].map((dir) => path.join(SRC_DIR, dir));

/** SEKME-F1.3b.0 §1 — primitive'lerin KENDİSİ taranmaz. */
const EXCLUDED_DIR_SEGMENTS = [
  `${path.sep}components${path.sep}ui${path.sep}`,
  `${path.sep}components${path.sep}form-shell${path.sep}`,
];

function productionTsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return productionTsxFiles(full);
    if (!full.endsWith(".tsx") || full.endsWith(".test.tsx")) return [];
    if (EXCLUDED_DIR_SEGMENTS.some((segment) => full.includes(segment))) return [];
    return [full];
  });
}

// Envanter §1 "Nihai kural" — girdi yüzeyi.
const CANDIDATE_A =
  /<\s*(Input|Select|Textarea|DateInput|Checkbox|Radio|Toggle|Segmented|FileInput)(\b|\/|>|\s)|<form(\b|\s|>)|from ["']@\/components\/form-shell["']|<Modal[\s>]/;

// Envanter §1 "Nihai kural" — kayıt niyeti. `\bon(Save|Submit)\w*\b` eki:
// mutasyonu ebeveynden PROP olarak alan saf form gövdeleri de yakalanır
// (`onSaveLine`, `onSubmitNewRow` — yukarıdaki kör nokta notu).
const CANDIDATE_B =
  /\buseMutation\b|\.mutate\(|\.mutateAsync\(|\bonSubmit\b|\bon(Save|Submit)\w*\b/;

/**
 * Envanterin 10 HAYIR dosyası (§2-4, tek cümlelik gerekçeyle) — her biri
 * gerçekten aday kümesine düşer (aksi halde "bayat muafiyet" olurdu, aşağıda
 * ayrı testle doğrulanır).
 */
const EXEMPT: Record<string, string> = {
  "app/login/LoginForm.tsx": "giriş ekranı, kullanıcı kararıyla hariç",
  "components/accounting/ChartOfAccountsView.tsx": "salt liste/arama, gerçek form ChartAccountFormModal'da",
  "components/accounting/PeriodClosingView.tsx": "yalnız yıl seçici + tek-tıkla eylem, serbest alan yok",
  "components/ai/AiPanel.tsx": "AI sohbet girdisi geçici, kayıt değil",
  "components/invoices/InvoicesView.tsx": "süzgeç/arama, kalıcı kaydet kavramı yok",
  "components/personnel-form/PersonnelFormActions.tsx": "salt buton şeridi, state PersonnelForm'da",
  "components/settings/users/UsersScreen.tsx": "salt liste+modal anahtarı, form alt-modallerde",
  "components/section-form/SectionTypePicker.tsx":
    "SectionForm'un alt-alan seçicisi: seçili tip SectionForm değerinde (dirty orada), 'yeni tip adı' geçici girdi",
  "components/site-form/SiteFormActions.tsx": "salt buton şeridi, state SiteCreateView'de",
  "components/timesheet/TimesheetWeekTable.tsx": "dirty zaten useTimesheetWeekEditor'de, çift kayıt riski",
  // Aşağıdaki iki dosya SEKME-F1.3b.0 envanterinde (70 aday) YOKTU — bu
  // bekçinin taramasında ek keşfedildi (envanter tam değildi). İkisi de
  // serbest metin/düzenlenebilir alan taşımayan TEK-TIKLA onay diyaloğu
  // (Modal + mutate/mutateAsync ama kaybolacak taslak veri yok) — mevcut
  // "tek tıkla eylem" EXEMPT emsaliyle (PeriodClosingView)
  // aynı gerekçe.
  "components/earned-value/catalog/DisciplineDeleteDialog.tsx": "yalnız silme onayı, düzenlenebilir alan yok",
  // TKL-F1.3.1: taslaklar EKRAN düzeyine taşındı (KIK:233-236). Satır yalnız çizer; kirli kaydı
  // `useUnsavedChanges(drafts.some(isDraftDirty))` ile `useWorkItemDrafts.ts` (.ts → taranmaz)
  // TÜM taslaklardan besler. Satır bileşeninde bağlamak süzgeçten düşen satırı kayıttan silerdi.
  "components/work-item-catalog/WorkItemEditRow.tsx":
    "saf çizim: taslak ve kirli kayıt ekran düzeyindeki useWorkItemDrafts'ta (useUnsavedChanges orada)",
  "components/earned-value/reports/daily/DailyApproveModal.tsx": "yalnız onay eylemi, düzenlenebilir alan yok",
  "components/delete-confirm/DeleteConfirmDialog.tsx": "yalnız silme onayı, düzenlenebilir alan yok (DisciplineDeleteDialog emsali)",
};

function isCandidate(code: string): boolean {
  return CANDIDATE_A.test(code) && CANDIDATE_B.test(code);
}

function isBound(code: string): boolean {
  const boundDirectly = /\buseUnsavedChanges\s*\(/.test(code);
  const boundViaModalIsDirty = /<Modal[^>]*\bisDirty\s*=/.test(code);
  return boundDirectly || boundViaModalIsDirty;
}

describe("bekçinin kendisi", () => {
  it("yorumdaki sahte eşleşmeyi saymaz, koddakini görür", () => {
    const commented = "// const x = <Input onSubmit={x} />\nconst y = 1;";
    expect(isCandidate(stripComments(commented))).toBe(false);

    const real = 'function F() { return <Input />; }\nuseMutation(); // onSubmit';
    expect(isCandidate(stripComments(real))).toBe(true);
  });

  it("aday ama bağlanmamış dosyayı ayırt eder", () => {
    expect(isBound("function F() { return <Input />; }")).toBe(false);
    expect(isBound('useUnsavedChanges(isDirty, "X");')).toBe(true);
    expect(isBound('<Modal isDirty={reason.trim() !== ""} onClose={onClose}>')).toBe(true);
  });
});

describe("SEKME-F1.3b — girdi yüzeyi + kayıt niyeti taşıyan her form bağlı ya da muaf", () => {
  const files = SCAN_ROOTS.flatMap(productionTsxFiles);
  const relFiles = files.map((file) => path.relative(SRC_DIR, file));

  const candidates = files
    .map((file) => ({ file, code: stripComments(readFileSync(file, "utf8")) }))
    .filter(({ code }) => isCandidate(code));

  it("taranacak dosya bulundu (bekçi boşa koşmuyor)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("aday sayısı boşa koşmuyor (regex kırılırsa küçülür)", () => {
    expect(candidates.length).toBeGreaterThanOrEqual(60);
  });

  it("EXEMPT'teki her dosya gerçekten var ve gerçekten aday", () => {
    for (const [relPath, reason] of Object.entries(EXEMPT)) {
      const full = path.join(SRC_DIR, relPath);
      expect(relFiles.includes(relPath), `EXEMPT'teki ${relPath} tarama kapsamında değil (yol mu değişti?)`).toBe(
        true,
      );
      expect(reason.length, `${relPath}: EXEMPT gerekçesi boş olamaz`).toBeGreaterThan(0);
      const code = stripComments(readFileSync(full, "utf8"));
      expect(
        isCandidate(code),
        `${relPath}: EXEMPT listesinde ama artık aday DEĞİL (bayat muafiyet) — listeden çıkar`,
      ).toBe(true);
    }
  });

  it.each(candidates.map(({ file }) => [path.relative(SRC_DIR, file), file]))("%s", (relPath, file) => {
    if (relPath in EXEMPT) return;
    const code = stripComments(readFileSync(file, "utf8"));
    expect(
      isBound(code),
      `${relPath}: aday form ama ne useUnsavedChanges(...) çağırıyor ne de <Modal isDirty=...> geçiyor. ` +
        `Bağla, ya da EXEMPT'e tek cümlelik gerekçeyle ekle.`,
    ).toBe(true);
  });
});
