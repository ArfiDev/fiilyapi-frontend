"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { UnitFormTabs } from "@/components/unit-shell/UnitFormTabs";
import { SALES_LIST_HREF } from "@/components/unit-shell/routes";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import {
  useDownloadUnitsImportTemplate,
  useImportUnits,
  useValidateUnitsImport,
} from "@/lib/api/hooks/useUnitImport";
import type { UnitImportUploadInput } from "@/lib/api/units-import-client";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { PROJECT_UNITS_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { buildImportFields, emptyUnitImportFormValues, type UnitImportFormValues } from "./build-request";
import { checkImportFile } from "./file-check";
import {
  IMPORT_CANCEL_LABEL,
  IMPORT_FILE_REQUIRED_MESSAGE,
  IMPORT_FORM_SUBTITLE,
  IMPORT_FORM_TITLE,
  IMPORT_PROJECT_REQUIRED_MESSAGE,
  IMPORT_REVALIDATE_LABEL,
  IMPORT_SERVER_RECHECK_NOTE,
  IMPORT_SUBMIT_ERROR_FALLBACK,
  IMPORT_TEMPLATE_ERROR_FALLBACK,
  IMPORT_TEMPLATE_LABEL,
  IMPORT_VALIDATE_ERROR_FALLBACK,
  IMPORT_VALIDATION_EMPTY_NOTICE,
  IMPORT_VALIDATION_STALE_NOTICE,
  importSubmitLabel,
} from "./constants";
import {
  deriveValidationOutcome,
  type ImportRowFilter,
  type UnitImportResult,
  type UnitImportValidation,
} from "./report";
import { ImportFileCard } from "./ImportFileCard";
import { ImportResultCard } from "./ImportResultCard";
import { ImportRowsCard } from "./ImportRowsCard";
import { ImportValidationCard } from "./ImportValidationCard";
import { PROJECT_PARAM } from "@/lib/navigation-params";
// Sıra önemli: ortak kabuk → aile ortağı → forma özgü bloklar.
import "@/styles/form-shell.css";
import "@/components/unit-shell/unit-shell.css";
import "./unit-import.css";

/**
 * T1'in SAF kurucusundan istemci girdisine köprü.
 *
 * `buildImportFields` `site_id`nin "boş dize ≠ yokluk" kuralının TEK sahibidir;
 * burada yeniden yazmak iki kopya üretirdi. `file` bilerek o katmanda YOKTUR
 * (DOM'suz test edilebilsin diye) ve yalnız burada eklenir.
 */
function toUploadInput(values: UnitImportFormValues, file: File): UnitImportUploadInput {
  const fields = buildImportFields(values);
  return {
    file,
    includeWarnings: fields.include_warnings,
    // Anahtar YOKSA hiç eklenmez: `siteId: undefined` de `site_id` alanını
    // gövdeye sokmaz ama niyeti gizlerdi.
    ...(fields.site_id == null ? {} : { siteId: fields.site_id }),
  };
}

/**
 * EI — "Excel'den Ünite İçe Aktarma" formu (`Form - Unite Excel Import.dc.html`,
 * kanonik). Yorumlardaki sayılar O DOSYANIN satır numaralarıdır.
 *
 * ⚠️ TAM SAYFA, MODAL DEĞİL: mockup kendi breadcrumb'ını (36), yapışkan üst
 * barını (31-42) ve beş sekmelik şeridini (47-53) çizer; "İptal" (200) bir
 * `<a href>`, yani GEZİNMEDİR.
 *
 * ⚠️ İZİN AYRIMI: ünite uçlarının kapısı `projects` modülüdür (`sales` DEĞİL).
 *
 * 🔴 İKİ ADIMLI AKIŞ VE DOSYANIN İKİ KEZ YÜKLENMESİ — bu ekranın belkemiği.
 * `import/validate` docstring'i sınırı kendi yazıyor: *"DOSYA SAKLANMADIGI ICIN
 * … 'Yeniden Doğrula → Aktar' akisinda dosya IKI KEZ yuklenir. Tarayicida bu
 * bedavadir: `File` nesnesi zaten istemcinin bellegindedir. Frontend dilimi
 * bunu bilerek yazar."* Seçilen `File` bu bileşenin durumunda TUTULUR ve İKİ
 * istekte de AYNI nesne gönderilir. Doğrulamanın sonucunu "sunucu dosyayı
 * hatırlıyor" sanıp aktarımda dosyayı göndermemek, her aktarımı 422 yapardı.
 *
 * 🔴 AKTARIM SONRASI LİSTEYE GİDİLMEZ (TU'nun aksine). `UnitImportResult`
 * `created`/`skipped`/`blocks_created` taşır ve KISMİ aktarım sunucunun
 * bilinçli davranışıdır; `router.push` bu üç sayıyı görünmeden yok ederdi.
 *
 * 🔴 İSTEMCİ ÖN KONTROLÜ TEK SAVUNMA HATTI DEĞİLDİR (`file-check.ts`): sunucu
 * `ensure_xlsx` + `ensure_size` ile aynı kontrolleri YENİDEN yapar, boyutu İKİ
 * KEZ ölçer, ayrıca satır sayısını ve başlıkları da denetler. Ön kontrolün
 * geçmesi bir garanti DEĞİLDİR ve sunucu hatası ASLA bastırılmaz.
 */
export function UnitImportView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const permission = useModulePermission("projects");
  // IZN-F2.x · blok/ünite/toplu/Excel/paylaşım yazma kapısı = mali.satis_* Düzenler (VEYA).
  const canEdit = useButtonGate({ pages: PROJECT_UNITS_EDIT, need: "edit", fallback: permission.canWrite });

  const [values, setValues] = useState<UnitImportFormValues>(() => emptyUnitImportFormValues());
  // SEKME-F1.6-Y1 — taban `StockEntryForm` deseniyle AYRI durum
  // (`[baseline, setBaseline]`): `isDirty` SABİT `emptyUnitImportFormValues()`
  // yerine bu tabanla kıyaslanır. `?proje=` tohumu (aşağıdaki efekt) tabanı da
  // kaydırır — yoksa proje seçimi URL'ye yazılıp sekmeye dönüldüğünde veya
  // sayfa yenilendiğinde form kullanıcı hiçbir şey yapmadan kirli açılırdı.
  const [baseline, setBaseline] = useState<UnitImportFormValues>(values);
  // 🔴 SEÇİLEN DOSYA DURUMDA TUTULUR — iki adımlı akışın tek dayanağı budur.
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [validation, setValidation] = useState<UnitImportValidation | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationStale, setValidationStale] = useState(false);
  const [blocksStale, setBlocksStale] = useState(false);
  const [result, setResult] = useState<UnitImportResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ImportRowFilter>("all");

  const projectsQuery = useProjects();
  const sitesQuery = useSites(values.projectId);
  const validateMutation = useValidateUnitsImport();
  const importMutation = useImportUnits();
  const templateMutation = useDownloadUnitsImportTemplate();
  const [templateError, setTemplateError] = useState<string | null>(null);

  // `?proje=` tohumlaması — YALNIZ BİR KEZ (`UnitCreateView`/TU deseni).
  // SEKME-F1.6-Y1 — `setValues` VE `setBaseline` AYNI dönüşümle, birlikte
  // çağrılır ("otomatik URL tohumu asla kullanıcı kirletti SAYILMAZ"): yalnız
  // `values` kaydırılsaydı taban geride kalır ve form kullanıcı hiçbir şey
  // yapmadan kirli doğardı.
  const projectSeededRef = useRef(false);
  useEffect(() => {
    if (projectSeededRef.current) return;
    projectSeededRef.current = true;
    const projeParam = searchParams.get(PROJECT_PARAM);
    if (!projeParam) return;
    const applySeed = (prev: UnitImportFormValues): UnitImportFormValues => ({
      ...prev,
      projectId: projeParam,
    });
    setValues(applySeed);
    setBaseline(applySeed);
  }, [searchParams]);

  // SEKME-F1.3b · dirty (tercih 1): ASYNC TABAN KISMEN — `?proje=` seed'i
  // senkron `useEffect`le TEK SEFER (`touched` kirletmez, `projectSeededRef`
  // deseniyle aynı güvenlik). 🔴 SIFIRLAMA — ORTAK EMİR KURAL 1 (B4): "aktarma
  // başarılı → TEMİZ" (kullanıcı/CEO kararı). Sayfadan ÇIKILMASA da
  // (bilerek — `created`/`skipped` sonucu ekranda kalır) `result !== null`
  // olduğunda form TEMİZ sayılır; dosya/proje seçimleri ekranda dursa da
  // "kaybolacak commit edilmemiş veri" artık YOKTUR.
  //
  // 🔴 TABAN `emptyUnitImportFormValues()` SABİTİ DEĞİL `baseline`dır
  // (SEKME-F1.6-Y1): `?proje=` tohumundan SONRA kullanıcının proje/şantiye
  // değiştirmesi hâlâ kirli sayılır — YALNIZ tohum efekti tabanı kaydırır,
  // `handleChangeProject`/`handleChangeSite` KAYDIRMAZ.
  const isDirty =
    result === null &&
    (file !== null || JSON.stringify(values) !== JSON.stringify(baseline));
  // Hook, erken dönüşten (`AccessDenied`) ÖNCE çağrılır.
  useUnsavedChanges(isDirty, "Ünite içe aktarma");

  if (!canEdit) return <AccessDenied />;

  const projects = projectsQuery.data?.items ?? [];
  const sites = sitesQuery.data?.items ?? [];

  const isValidating = validateMutation.isPending;
  const isImporting = importMutation.isPending;
  const isBusy = isValidating || isImporting;

  const outcome =
    validation === null
      ? null
      : deriveValidationOutcome(validation, { includeWarnings: values.includeWarnings });
  const importableCount = outcome?.kind === "ready" ? outcome.importableCount : null;
  // Sunucunun 422 döneceğini ÖNCEDEN biliyorsak boşuna bir yükleme yaptırılmaz.
  const serverWillReject = outcome?.serverWillReject ?? false;
  const submitLabel = importSubmitLabel(importableCount);
  const canSubmit = file !== null && values.projectId !== "" && !isBusy && !serverWillReject;

  /** Girdi değişince ESKİ doğrulama ARTIK GEÇERLİ DEĞİLDİR; bayat tablo tutulmaz. */
  function invalidateValidation() {
    setValidationStale(validation !== null);
    setValidation(null);
    setValidationError(null);
    setBlocksStale(false);
    setResult(null);
    setFilter("all");
  }

  /** İki ucun da ortak ön koşulu; sağlanmıyorsa istek KURULMAZ. */
  function missingInputMessage(): string | null {
    if (values.projectId === "") return IMPORT_PROJECT_REQUIRED_MESSAGE;
    if (file === null) return IMPORT_FILE_REQUIRED_MESSAGE;
    return null;
  }

  async function runValidation(nextFile: File, nextValues: UnitImportFormValues) {
    setValidationError(null);
    setValidationStale(false);
    setBlocksStale(false);
    try {
      const validated = await validateMutation.mutateAsync({
        projectId: nextValues.projectId,
        input: toUploadInput(nextValues, nextFile),
      });
      setValidation(validated);
    } catch (error) {
      // 422 (uzantı/boyut/satır sayısı/eksik başlık) ve 404 (görünmeyen proje)
      // gövdeleri OLDUĞU GİBİ basılır — ön kontrol geçti diye bastırılmaz.
      setValidation(null);
      setValidationError(backendErrorMessage(error, IMPORT_VALIDATE_ERROR_FALLBACK));
    }
  }

  /**
   * 76 — dosya seçimi. Ön kontrol (`file-check.ts`) sunucunun KENDİ sırasıyla
   * çalışır (önce uzantı, sonra boyut) ve mesajları ORADAN kopyadır; reddedilen
   * dosya için HİÇBİR istek kurulmaz.
   */
  function handleSelectFile(selected: File | null) {
    if (selected === null) return;

    const check = checkImportFile({ name: selected.name, size: selected.size });
    if (!check.ok) {
      setFile(null);
      setFileError(check.message);
      invalidateValidation();
      return;
    }

    setFile(selected);
    setFileError(null);
    setFormError(null);
    invalidateValidation();
    // Proje seçilmeden doğrulama ucu kurulamaz (proje PATH parametresidir).
    if (values.projectId === "") {
      setValidationError(IMPORT_PROJECT_REQUIRED_MESSAGE);
      return;
    }
    void runValidation(selected, values);
  }

  function handleRemoveFile() {
    setFile(null);
    setFileError(null);
    setFormError(null);
    invalidateValidation();
    setValidationStale(false);
  }

  function handleChangeProject(projectId: string) {
    // Proje değişince şantiye seçimi ve DOĞRULAMA geçersizleşir: doğrulama
    // BAŞKA bir projenin bloklarına/ünite numaralarına göre yapılmıştı.
    setValues((prev) => ({ ...prev, projectId, siteId: "" }));
    invalidateValidation();
    setTemplateError(null);
    // KAYIT 385 — reddedilmiş bir dosyadan sonra proje değiştirilirse eski
    // dosya hatası ekranda YAPIŞIK kalırdı (`templateError` gibi temizlenmiyordu).
    setFileError(null);
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) params.set(PROJECT_PARAM, projectId);
    else params.delete(PROJECT_PARAM);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  function handleChangeSite(siteId: string) {
    // `site_id` YALNIZ yeni blok açılırken kullanılır; satır raporunu ve
    // sayaçları DEĞİŞTİRMEZ, bu yüzden doğrulama sonucu ATILMAZ.
    setValues((prev) => ({ ...prev, siteId }));
  }

  /**
   * 192 — kutucuk. Ölçüldü: `include_warnings` sayaçları (`_summary` durum
   * sayar) ve satır raporunu DEĞİŞTİRMEZ; yalnız `blocks_to_create`
   * (`_blocks_to_create` yazılacak satırlara bakar) ve aktarılacak satır sayısı
   * ona bağlıdır. Bu yüzden doğrulama ATILMAZ — yalnız blok listesi "bayat"
   * işaretlenir ve kullanıcı isterse yeniden doğrular.
   */
  function handleToggleIncludeWarnings(next: boolean) {
    setValues((prev) => ({ ...prev, includeWarnings: next }));
    if (validation !== null) setBlocksStale(true);
  }

  /** 201 "Yeniden Doğrula" — aynı `File` ikinci kez yüklenir. */
  async function handleRevalidate() {
    const missing = missingInputMessage();
    if (missing !== null) {
      setValidationError(missing);
      return;
    }
    setResult(null);
    await runValidation(file as File, values);
  }

  /** 38/202 "N Geçerli Satırı Aktar" — AYNI `File` üçüncü kez değil, İKİNCİ kez. */
  async function handleImport() {
    const missing = missingInputMessage();
    if (missing !== null) {
      setFormError(missing);
      return;
    }
    setFormError(null);
    try {
      const imported = await importMutation.mutateAsync({
        projectId: values.projectId,
        input: toUploadInput(values, file as File),
      });
      // 🔴 LİSTEYE GİDİLMEZ: `created`/`skipped` ekranda kalmalı.
      setResult(imported);
    } catch (error) {
      // 🔴 422 = "hic gecerli satir yok". Yutulursa kullanıcı hiçbir şey
      // yazılmadığını asla öğrenemezdi.
      setResult(null);
      setFormError(backendErrorMessage(error, IMPORT_SUBMIT_ERROR_FALLBACK));
    }
  }

  /** 37/87 "Şablon İndir" — 12 başlıklı boş `.xlsx`. */
  async function handleDownloadTemplate() {
    if (values.projectId === "") {
      setTemplateError(IMPORT_PROJECT_REQUIRED_MESSAGE);
      return;
    }
    setTemplateError(null);
    try {
      await templateMutation.mutateAsync(values.projectId);
    } catch (error) {
      setTemplateError(backendErrorMessage(error, IMPORT_TEMPLATE_ERROR_FALLBACK));
    }
  }

  return (
    <div className="pf-shell">
      {/* 31-42 — kabuk canonuna oturtulmuş üst şerit */}
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          <Link href={SALES_LIST_HREF}>Satış Yönetimi</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            {IMPORT_FORM_TITLE}
          </span>
        </nav>
        <div className="pf-topbar__actions">
          {/* 37 */}
          <Button
            variant="secondary"
            className="pf-topbar-cancel"
            data-testid="excel-form-sablon-ust"
            disabled={templateMutation.isPending || values.projectId === ""}
            onClick={handleDownloadTemplate}
          >
            {IMPORT_TEMPLATE_LABEL}
          </Button>
          {/* 38 */}
          <Button
            variant="success"
            className="pf-topbar-submit"
            data-testid="excel-form-aktar-ust"
            onClick={handleImport}
            disabled={!canSubmit}
          >
            {isImporting ? "Aktarılıyor…" : submitLabel}
          </Button>
        </div>
      </div>

      <div className="pf ei-page">
        {/* 47-53 */}
        <UnitFormTabs activeTab="Excel İçe Aktar" />

        <header className="pf-head">
          <h1 className="pf-title">{IMPORT_FORM_TITLE}</h1>
          <p className="pf-subtitle">{IMPORT_FORM_SUBTITLE}</p>
        </header>

        <div className="pf-body" data-testid="excel-form-govde">
          <ImportFileCard
            values={values}
            projects={projects}
            sites={sites}
            projectsDisabled={projectsQuery.isLoading || projectsQuery.isError}
            sitesDisabled={sitesQuery.isLoading || sitesQuery.isError}
            file={file}
            fileError={fileError}
            rowsRead={validation?.summary.total_rows ?? null}
            templateBusy={templateMutation.isPending}
            templateError={templateError}
            onChangeProject={handleChangeProject}
            onChangeSite={handleChangeSite}
            onSelectFile={handleSelectFile}
            onRemoveFile={handleRemoveFile}
            onDownloadTemplate={handleDownloadTemplate}
          />

          <ImportValidationCard
            validation={validation}
            includeWarnings={values.includeWarnings}
            blocksStale={blocksStale}
            isLoading={isValidating}
            errorMessage={validationError}
            emptyNotice={
              validationStale ? IMPORT_VALIDATION_STALE_NOTICE : IMPORT_VALIDATION_EMPTY_NOTICE
            }
          />

          {validation && (
            <ImportRowsCard
              validation={validation}
              filter={filter}
              includeWarnings={values.includeWarnings}
              onChangeFilter={setFilter}
              onToggleIncludeWarnings={handleToggleIncludeWarnings}
            />
          )}

          {result && <ImportResultCard result={result} />}
        </div>

        {/* Ön kontrolün SINIRI görünür yazılır — "dosya bana uygun göründü"
            cümlesi bir garanti değildir. */}
        <p className="ei-recheck-note" data-testid="excel-form-sunucu-notu">
          {IMPORT_SERVER_RECHECK_NOTE}
        </p>

        {formError && (
          <p className="pf-form-error" data-testid="excel-form-hata">
            {formError}
          </p>
        )}

        {/* 199-203 — alt eylem şeridi (sağa yaslı, üç eylem) */}
        <div className="pf-actions">
          <Link
            href={SALES_LIST_HREF}
            className="btn btn--secondary btn--md pf-action pf-action--cancel"
            data-testid="excel-form-iptal"
          >
            {IMPORT_CANCEL_LABEL}
          </Link>
          <Button
            variant="secondary"
            className="pf-action pf-action--draft"
            data-testid="excel-form-yeniden-dogrula"
            onClick={handleRevalidate}
            disabled={isBusy}
          >
            {isValidating ? "Doğrulanıyor…" : IMPORT_REVALIDATE_LABEL}
          </Button>
          <Button
            variant="success"
            className="pf-action pf-action--submit"
            data-testid="excel-form-aktar"
            onClick={handleImport}
            disabled={!canSubmit}
          >
            {isImporting ? "Aktarılıyor…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
