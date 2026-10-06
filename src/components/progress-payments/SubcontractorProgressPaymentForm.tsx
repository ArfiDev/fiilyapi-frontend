"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { CalendarCheckIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useSubcontractorDiarySuggestion } from "@/lib/api/hooks/useDiarySuggestion";
import {
  useSubcontractorContract,
  useSubcontractorProgressPayment,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import {
  useCreateSubcontractorProgressPayment,
  useReplaceSubcontractorProgressPaymentLines,
  useSubmitSubcontractorProgressPayment,
  useUpdateSubcontractorProgressPayment,
} from "@/lib/api/hooks/useSubcontractorProgressPaymentMutations";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useSite } from "@/lib/api/hooks/useSites";
import { isForbidden } from "@/lib/api/unwrap";
import { SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { SUBCONTRACTOR_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { pendingModuleLabel } from "@/lib/pending-modules";
import { PERIOD_MONTHS, formatAmount, formatPercent } from "@/lib/format";

import { DiaryFillFeedback } from "./DiaryFillFeedback";
import { applySubcontractorDiarySuggestion } from "./diary-fill";
import { omitKeys } from "./omit-keys";
import { periodFields, type OmittablePeriodField } from "./period-fields";
import { isDiarySourced } from "./quantity-source";
import { useDiaryFill } from "./useDiaryFill";
import {
  buildPaymentCalculationRows,
  type PaymentCalculationRow,
} from "./shared/payment-calculation-rows";
import { trQuantityInputValue } from "@/components/contracts/employer-item-inline";
import {
  buildSubcontractorLineRows,
  buildSubcontractorLinesSaveBody,
  type SubcontractorLineRow,
} from "./th-lines";
import { formatTrQuantityText, parsePaymentCoefficient, sanitizeTrDecimalInput } from "./tr-quantity";
import "./progress-payment-form.css";
import "./subcontractor-progress-payment-form.css";
import { SourceCodeSub } from "@/components/catalog-shared/SourceCodeSub";
import { routes } from "@/lib/routes";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

export type SubcontractorProgressPaymentFormProps =
  | { mode: "create"; contractId: string }
  | { mode: "edit"; paymentId: string };

/** Fix round 1 (kontrolcü bulgusu, Important) — eksik sözleşme birim fiyatı
 * hücresinin `title`/`sr-only` metni; T2'nin `pendingModuleLabel` deseninden
 * BİLEREK ayrı tutuldu, çünkü bu bir "modül henüz yok" durumu DEĞİL, bu
 * spesifik sözleşme kaleminde fiyatın hiç girilmemiş olmasıdır (veri
 * eksikliği, backend yeteneği eksikliği değil). */
const MISSING_UNIT_PRICE_HINT = "Bu kalem için sözleşmede birim fiyat girilmemiş.";

/** Final inceleme F-7 (kalıcı kural: mockup öğesi izsiz kaybolamaz) — mockup
 * O21 "Hakediş #48 Oluştur" der; `create` kipinde sıra numarası HENÜZ YOKTUR
 * (şema `sequence_no`yu ilk POST'ta üretir). `MISSING_UNIT_PRICE_HINT` ile
 * AYNI gerekçeyle `pendingModuleLabel`dan ayrı tutuldu: bu bir "modül henüz
 * yok" durumu DEĞİL, henüz üretilmemiş bir değerdir. */
const PENDING_SEQUENCE_HINT = "Sıra numarası ilk kayıtta backend tarafından verilir.";

/**
 * F-TH T3 · Taşeron hakediş oluştur/düzenle formu. Mockup:
 * `Taşeron Hakediş Oluştur.dc.html`. `create`/`edit` AYNI bileşendir
 * (`ProgressPaymentForm` deseni) — iki kopya form YAZILMAZ.
 *
 * Kaydetme yolu İşveren'den FARKLI (brief §3): `SubcontractorProgressPayment
 * Create` `lines[]` TAŞIMAZ (şema), bu yüzden atomik tek-POST YAPILAMAZ —
 * `create` kipinde de sırayla POST (başlık) → PUT …/lines (miktarlar)
 * çağrılır. Bu, backend'in `calculation` bloğunun `create` akışında İLK
 * KAYDETMEYE KADAR mevcut olmadığı anlamına gelir: tfoot bu süre boyunca
 * YAPISINI korur (5 satır, doğru yüzde etiketleri — sözleşmenin `*_pct`
 * alanlarından) ama tutar sütunu "—" basar. Bu, İşveren formunun ZATEN
 * uyguladığı kararla AYNIDIR (`PaymentFormPivotTable`: kaydedilmemiş hücrede
 * "—", ikinci bir çarpma/toplama motoru İCAT EDİLMEZ) — burada yalnız aynı
 * karar tfoot seviyesine taşınmıştır.
 */
export function SubcontractorProgressPaymentForm(props: SubcontractorProgressPaymentFormProps) {
  const router = useRouter();
  const { canWrite: moduleCanWrite } = useModulePermission("progress_payments");
  const isAmountHidden = useCategoryHidden(SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES);
  const isEdit = props.mode === "edit";
  const detailQuery = useSubcontractorProgressPayment(isEdit ? props.paymentId : "");
  const detail = isEdit ? detailQuery.data : undefined;

  const resolvedContractId = isEdit ? (detail?.contract_id ?? "") : props.contractId;
  const contractQuery = useSubcontractorContract(resolvedContractId);
  const contract = contractQuery.data;
  // IZN-F2.x · hakediş oluştur/düzenle = taşeron hakediş ailesi Düzenler (IZN-F5b, HT); IZN-F3.2b · o projedeki rolden.
  const canWrite = useButtonGate({
    pages: SUBCONTRACTOR_PAYMENT_EDIT,
    need: "edit",
    fallback: moduleCanWrite,
    projectId: contract?.project_id,
  });

  const projectQuery = useProject(contract?.project_id ?? "");
  const siteQuery = useSite(contract?.site_id ?? "");

  const createPayment = useCreateSubcontractorProgressPayment();
  const updatePayment = useUpdateSubcontractorProgressPayment();
  const replaceLines = useReplaceSubcontractorProgressPaymentLines();
  const submitPayment = useSubmitSubcontractorProgressPayment();

  const [rows, setRows] = useState<SubcontractorLineRow[] | null>(null);
  const [periodYear, setPeriodYear] = useState<number | null>(null);
  const [periodMonth, setPeriodMonth] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [defaultCoefficient, setDefaultCoefficient] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);
  // TKL-F7b · görünür alan hataları (kayıt denemesinde dolar; ilgili alan düzenlenince temizlenir).
  const [lineErrors, setLineErrors] = useState<Readonly<Record<string, string>>>({});
  const [coefficientError, setCoefficientError] = useState<string | null>(null);
  // Kullanıcının GERÇEKTEN dokunduğu dönem alanları. Mockup'ta ay seçicisinin
  // boş seçeneği yoktur, ekranda hep dolu görünür ve "görünen değer"
  // kullanıcının KARARI DEĞİLDİR (bkz. `omittedPeriodFields`).
  const [touchedPeriodFields, setTouchedPeriodFields] = useState<
    ReadonlySet<OmittablePeriodField>
  >(() => new Set());
  // SEKME-F1.3b · bu formda BUGÜN hiç dirty durumu YOK (envanter ölçümü —
  // doğrulandı) — başlangıçla karşılaştırma kurulur (tercih 2). Taban 🔴
  // ASYNC: tohumlama efektiyle AYNI ANDA (aşağıda) alınır; efekt tamamlanana
  // kadar `rows === null` ve form "Yükleniyor…" gösterir (aşağıdaki erken
  // dönüş), yani dirty hiç YANLIŞ-POZİTİF üretmez.
  const [baseline, setBaseline] = useState<{
    rows: readonly { itemId: string; quantity: string }[];
    periodYear: number | null;
    periodMonth: number | null;
    sectionId: string | null;
    defaultCoefficient: string;
  } | null>(null);
  const isDirty =
    baseline !== null &&
    (periodYear !== baseline.periodYear ||
      periodMonth !== baseline.periodMonth ||
      sectionId !== baseline.sectionId ||
      defaultCoefficient !== baseline.defaultCoefficient ||
      (rows ?? []).some((row, index) => row.quantity !== baseline.rows[index]?.quantity));
  useUnsavedChanges(isDirty, "Taşeron hakediş");

  // Tohumlama YALNIZ BİR KEZ çalışır (`ProgressPaymentForm` deseni) —
  // sonraki `detailQuery`/`contractQuery` yenilemeleri (ör. kaydetme
  // sonrası invalidation) kullanıcının o anki düzenlemesini SİLMEZ.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!contract) return;
    if (isEdit && !detail) return;
    seededRef.current = true;
    const seededRows = buildSubcontractorLineRows(contract.items, detail?.lines ?? []);
    const seededYear = detail?.period_year ?? new Date().getFullYear();
    const seededMonth = detail?.period_month ?? new Date().getMonth() + 1;
    const seededSection = detail?.section_id ?? null;
    const seededCoefficient = trQuantityInputValue(detail?.default_coefficient ?? "1");
    setRows(seededRows);
    setPeriodYear(seededYear);
    setPeriodMonth(seededMonth);
    setSectionId(seededSection);
    setDefaultCoefficient(seededCoefficient);
    setBaseline({
      rows: seededRows.map((row) => ({ itemId: row.itemId, quantity: row.quantity })),
      periodYear: seededYear,
      periodMonth: seededMonth,
      sectionId: seededSection,
      defaultCoefficient: seededCoefficient,
    });
  }, [contract, detail, isEdit]);

  // "Günlükten Doldur" (spec §4) — sözleşme bazlı uç. Açılışta ÇEKİLMEZ
  // (`enabled: false`); butona basılınca formun dönemiyle çağrılır.
  const diarySuggestionQuery = useSubcontractorDiarySuggestion(resolvedContractId, {
    year: periodYear ?? undefined,
    month: periodMonth ?? undefined,
    enabled: false,
  });
  const diaryFill = useDiaryFill({
    fetchSuggestion: () => diarySuggestionQuery.refetch(),
    apply: (lines) => applySubcontractorDiarySuggestion(rows ?? [], lines),
    commit: (application) => {
      // Doldurmanın DEĞİŞTİRDİĞİ satırların hatası kalkar; değişmeyen hatalı satırın hatası kalır.
      const changedIds = changedLineIds(rows ?? [], application.rows);
      setLineErrors((prev) => omitKeys(prev, changedIds));
      setRows(application.rows);
    },
  });

  if (!canWrite) return <AccessDenied />;
  if (isForbidden(detailQuery.error) || isForbidden(contractQuery.error)) {
    return <AccessDenied />;
  }

  if (isEdit && (detailQuery.isLoading || !detail)) {
    return <p className="pp-form__message">Yükleniyor…</p>;
  }

  // Düzenleme yalnız `draft` durumunda anlamlıdır (brief §Rotalar) — sessizce
  // boş form gösterilmez, Türkçe uyarı + listeye dönüş linki basılır (T4
  // detay ekranı bu dilimin kapsamı DIŞI).
  if (isEdit && detail && detail.status !== "draft") {
    return (
      <div className="pp-form">
        <Alert variant="warning" className="pp-form__alert">
          Bu hakediş artık taslak durumunda değil, düzenlenemez.
        </Alert>
        <Link href={routes.progressPayments.subcontractor.list()} className="pp-form__crumb-link">
          ← Taşeron Hakedişi listesine dön
        </Link>
      </div>
    );
  }

  if (contractQuery.isError) {
    return (
      <Alert variant="danger" className="pp-form__alert">
        {backendErrorMessage(contractQuery.error, "Sözleşme bilgisi yüklenemedi.")}
      </Alert>
    );
  }
  if (contractQuery.isLoading || !contract || rows === null) {
    return <p className="pp-form__message">Yükleniyor…</p>;
  }

  const isSaving =
    createPayment.isPending ||
    updatePayment.isPending ||
    replaceLines.isPending ||
    submitPayment.isPending;

  function updateQuantity(itemId: string, value: string) {
    setLineErrors((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setRows((prev) =>
      (prev ?? []).map((row) => (row.itemId !== itemId ? row : { ...row, quantity: value })),
    );
  }

  function markPeriodTouched(field: OmittablePeriodField) {
    setTouchedPeriodFields((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  }

  /**
   * PATCH gövdesinden ATLANACAK dönem alanları (işveren formuyla AYNI karar).
   *
   * "Dönem" ay seçicisi mockup'ta boş seçenek TAŞIMAZ
   * (`Taşeron Hakediş Oluştur.dc.html:56`): sunucuda `null` olsa bile ekranda
   * dolu bir dönem görünür ve tohumlama `??` ile BUGÜNÜN ay/yılını basar.
   * Kullanıcı dönemi hiç SEÇMEDEN kaydederse anahtarı göndermek, kullanıcının
   * VERMEDİĞİ bir dönem kararını PARA kaydına yazmak olurdu — sunucudaki `null`
   * sessizce EZİLİRDİ (yanlış dönem = maliyet/gelir yanlış aya düşer). Bu yüzden
   * "sunucuda null + dokunulmamış" durumunda anahtar hiç basılmaz.
   *
   * Dolu gelen dönem zaten tohumlanmıştır ve normal gider; kullanıcı dokunduysa
   * seçimi normal gider. OLUŞTURMA kipi etkilenmez: orada ezilecek sunucu
   * değeri YOKTUR. `section_id` bu mekanizmanın DIŞINDADIR — onun seçicisinde
   * "Tüm Bölümler" BOŞ seçeneği vardır, yani `null` ekranda dürüstçe görünür ve
   * açıkça gönderilmesi bölümü TEMİZLEYEBİLMEK için gereklidir.
   */
  const omittedPeriodFields: readonly OmittablePeriodField[] =
    !isEdit || !detail
      ? []
      : [
          ...(detail.period_year === null && !touchedPeriodFields.has("period_year")
            ? (["period_year"] as const)
            : []),
          ...(detail.period_month === null && !touchedPeriodFields.has("period_month")
            ? (["period_month"] as const)
            : []),
        ];

  function headerBody(coefficient: string) {
    return {
      ...periodFields(periodYear, periodMonth, omittedPeriodFields),
      default_coefficient: coefficient,
      section_id: sectionId,
    };
  }

  function validateHeader(): string | null {
    if (periodYear === null || periodMonth === null) return "Dönem seçimi zorunludur.";
    return null;
  }

  function handleSaveDraft() {
    doSave(false);
  }

  function handleSubmitForApproval() {
    doSave(true);
  }

  function doSave(alsoSubmit: boolean) {
    setFormError(null);
    const validationError = validateHeader();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    const { body: linesBody, errors } = buildSubcontractorLinesSaveBody(rows ?? []);
    const coefficient = parsePaymentCoefficient(defaultCoefficient);
    setLineErrors(errors);
    setCoefficientError(coefficient.kind === "error" ? coefficient.message : null);
    if (coefficient.kind === "error" || Object.keys(errors).length > 0) return;
    const savedCoefficient = coefficient.value;

    function afterLinesSaved(paymentId: string) {
      if (!alsoSubmit) {
        router.push(routes.progressPayments.subcontractor.list());
        return;
      }
      submitPayment.mutate(paymentId, {
        onSuccess: () => router.push(routes.progressPayments.subcontractor.list()),
        onError: (err) => setFormError(backendErrorMessage(err, "Hakediş onaya gönderilemedi.")),
      });
    }

    if (props.mode === "create") {
      createPayment.mutate(
        { contractId: resolvedContractId, body: headerBody(savedCoefficient) },
        {
          onSuccess: (created) => {
            replaceLines.mutate(
              { paymentId: created.id, body: { lines: linesBody } },
              {
                onSuccess: () => afterLinesSaved(created.id),
                onError: (err) =>
                  setFormError(backendErrorMessage(err, "Hakediş satırları kaydedilemedi.")),
              },
            );
          },
          onError: (err) => setFormError(backendErrorMessage(err, "Hakediş oluşturulamadı.")),
        },
      );
      return;
    }

    const paymentId = props.paymentId;
    updatePayment.mutate(
      { paymentId, body: headerBody(savedCoefficient) },
      {
        onSuccess: () => {
          replaceLines.mutate(
            { paymentId, body: { lines: linesBody } },
            {
              onSuccess: () => afterLinesSaved(paymentId),
              onError: (err) =>
                setFormError(backendErrorMessage(err, "Hakediş satırları kaydedilemedi.")),
            },
          );
        },
        onError: (err) => setFormError(backendErrorMessage(err, "Hakediş güncellenemedi.")),
      },
    );
  }

  const site = siteQuery.data;
  const sections = site?.sections ?? [];
  const groupedRows = groupBySequence(rows);

  const percents = {
    vat_pct: contract.vat_pct,
    advance_pct: contract.advance_pct,
    retainage_pct: contract.retainage_pct,
  };
  const calcRows = detail?.calculation
    ? buildPaymentCalculationRows(detail.calculation, percents, {
        grossLabel: "TOPLAM HAKEDİŞ",
        netLabel: "NET ÖDENECEK",
      })
    : ([
        { key: "gross", label: "TOPLAM HAKEDİŞ", value: "—" },
        { key: "vat", label: `KDV (${formatPercent(percents.vat_pct)})`, value: "—" },
        {
          key: "advance",
          label: `Avans Kesintisi (${formatPercent(percents.advance_pct)})`,
          value: "—",
        },
        {
          key: "retention",
          label: `Teminat Kesintisi (${formatPercent(percents.retainage_pct)})`,
          value: "—",
        },
        { key: "net", label: "NET ÖDENECEK", value: "—", emphasis: true },
      ] satisfies PaymentCalculationRow[]);

  return (
    <div className="pp-form">
      <div className="pp-form__title-row">
        {/* Mockup'ta bu metin sabit üst navbar'ın içindedir (satır 18-22);
            F3 kabuğu bu uygulamada TEK global üst çubuğu sağladığından
            (brief: mockup mimariyle çelişirse mockup kazanır ama kabuk
            değiştirilmez), aynı içerik sayfanın TEK h1'i olarak basılır —
            diğer ekranlardaki `.pp-form__title` deseninin küçük-metin
            varyantı (a11y: her sayfada bir h1). */}
        <h1 className="pp-form__crumb thf-crumb">
          {/* Final inceleme F-1 · mockup O19'da bu parça "Taşeron Sözleşme
              Detay" ekranına giden bir BAĞLANTIDIR. **F-P5 T7'de AKTİFLEŞTİ:**
              hedef rota (`/sozlesmeler/taseron/{contractId}`) artık VAR →
              devre-dışı hâli + pending gerekçesi KALDIRILDI. */}
          <Link
            className="thf-crumb__contract-link"
            href={routes.contracts.subcontractorDetail({ contractId: contract.id })}
            data-testid="thf-contract-crumb-link"
          >
            {contract.subcontractor_name ?? "—"} {contract.contract_no ?? ""}
          </Link>
          {" · "}
          {isEdit && detail ? (
            `Hakediş #${detail.sequence_no} Düzenle`
          ) : (
            /* Final inceleme F-7 · mockup O21 "Hakediş #48 Oluştur" — sıra
               numarası create kipinde henüz üretilmemiştir; öğe atlanmaz,
               repo'nun pending deseniyle ("—" + title/sr-only) basılır. */
            <>
              Hakediş{" "}
              <span
                className="thf-crumb__pending"
                title={PENDING_SEQUENCE_HINT}
                data-testid="thf-sequence-pending"
              >
                #—<span className="sr-only">{PENDING_SEQUENCE_HINT}</span>
              </span>{" "}
              Oluştur
            </>
          )}
        </h1>
        <div className="pp-form__title-actions">
          {/* Spec §4 (kullanıcı kararı S5) — mockup'ta olmayan ONAYLI ek
              aksiyon; stil formun mevcut ikincil buton deseniyle AYNI. */}
          <Button
            variant="secondary"
            onClick={diaryFill.run}
            disabled={isSaving || diaryFill.isPending}
            data-testid="thf-diary-fill"
          >
            <CalendarCheckIcon />
            {diaryFill.isPending ? "Günlük okunuyor…" : "Günlükten Doldur"}
          </Button>
          <Button variant="secondary" onClick={handleSaveDraft} disabled={isSaving}>
            {isSaving ? "Kaydediliyor…" : "Taslak Kaydet"}
          </Button>
          <Button variant="primary" onClick={handleSubmitForApproval} disabled={isSaving}>
            {isSaving ? "Kaydediliyor…" : "Onaya Gönder"}
          </Button>
        </div>
      </div>

      {formError && (
        <Alert variant="danger" className="pp-form__alert" data-testid="thf-form-error">
          {formError}
        </Alert>
      )}

      <DiaryFillFeedback
        notice={diaryFill.notice}
        confirmOverwriteCount={diaryFill.confirmOverwriteCount}
        onConfirmOverwrite={diaryFill.confirmOverwrite}
        onCancelOverwrite={diaryFill.cancelOverwrite}
        testIdPrefix="thf"
      />

      {(detail?.dropped_orphan_count ?? 0) > 0 && (
        <Alert variant="warning" className="pp-form__alert" data-testid="thf-dropped-orphan-alert">
          {detail?.dropped_orphan_count} satır artık sözleşmede bulunmayan poz(lar)a bağlı olduğu
          için otomatik olarak kaldırıldı.
        </Alert>
      )}

      {/* Fix round 1 (kontrolcü bulgusu, Important): eksik sözleşme birim
          fiyatı sessizce "₺ 0"a düşürülmez — `contract.items_missing_price`
          (backend'in KENDİ saydığı, ikinci bir sayım İCAT EDİLMEDİ) > 0 iken
          görünür uyarı basılır. */}
      {contract.items_missing_price > 0 && (
        <Alert variant="warning" className="pp-form__alert" data-testid="thf-missing-price-alert">
          {contract.items_missing_price} poz için sözleşmede birim fiyat girilmemiş; bu pozlarda
          birim fiyat ve tutar gösterilemiyor.
        </Alert>
      )}

      {/* Hiyerarşi şeridi (mockup 33-42). İlk halka (işveren sözleşme no'su)
          şemada YOK → zarif düşüş (T2'deki pending desenini kullanır).
          Final inceleme F-1 (kalıcı kural): "Sözleşmeyi Gör →" (mockup O41)
          BASILIR. **F-P5 T7'de AKTİFLEŞTİ:** hedef rota
          (`/sozlesmeler/taseron/{contractId}` · TSD) artık VAR, bu yüzden
          devre-dışı hâli (`role="link"` + `aria-disabled` + pending gerekçesi)
          KALDIRILDI ve gerçek `Link`e dönüştürüldü. */}
      <div className="thf-hierarchy" data-testid="thf-hierarchy">
        <span
          className="thf-hierarchy__chip thf-hierarchy__chip--pending"
          title={pendingModuleLabel("contracts")}
        >
          —<span className="sr-only">{pendingModuleLabel("contracts")}</span>
        </span>
        <span className="thf-hierarchy__sep">→</span>
        <span className="thf-hierarchy__crumb">{projectQuery.data?.name ?? "—"}</span>
        <span className="thf-hierarchy__sep">→</span>
        <span className="thf-hierarchy__crumb">{site?.name ?? "—"}</span>
        <span className="thf-hierarchy__sep">→</span>
        <span className="thf-hierarchy__chip thf-hierarchy__chip--accent">
          {contract.contract_no ?? ""} {contract.subcontractor_name ?? "—"}
        </span>
        <Link
          className="thf-hierarchy__see-contract"
          href={routes.contracts.subcontractorDetail({ contractId: contract.id })}
          data-testid="thf-see-contract-link"
        >
          Sözleşmeyi Gör →
        </Link>
      </div>

      {/* Fiyat farkı katsayısı — ONAYLI SAPMA (mockup'ta yok, brief §Üst
          şerit). Taşeron sözleşmesinde işverendeki `has_price_escalation`
          kilidi YOK (şema açıklaması) — bu yüzden İşveren'in kilit/toggle
          deseni DEĞİL, sade her zaman-düzenlenebilir katsayı alanı. */}
      <div className="pp-form__ff-band" data-testid="thf-coefficient-band">
        <span>Fiyat Farkı Katsayısı</span>
        <div className="pp-form__ff-coefficient">
          <Field label="Katsayı (Dn/D0)" size="md" error={coefficientError}>
            {(control) => (
              <Input
                {...control}
                size="row"
                numeric
                inputMode="decimal"
                maxLength={10}
                value={defaultCoefficient}
                onChange={(event) => {
                  setCoefficientError(null);
                  setDefaultCoefficient(sanitizeTrDecimalInput(event.target.value));
                }}
              />
            )}
          </Field>
        </div>
      </div>

      {/* Bilgi kutusu (mockup 44-50) — metin BİREBİR. */}
      <div className="pp-form__info">
        <span aria-hidden="true">✅</span>
        <div>
          <strong>Birim fiyatlar taşeron sözleşmesinden otomatik yüklendi.</strong> Sadece bu
          döneme ait miktarları girin — toplam otomatik hesaplanır. Günlük kayıtlardan hesaplanan
          miktarlar sarı ile gösteriliyor, isterseniz düzeltebilirsiniz.
        </div>
      </div>

      {/* Üst form — 2×2 (mockup 54-62). */}
      <div className="pp-form__header-card">
        <div className="pp-form__header-grid thf-header-grid">
          <Field label="Taşeron">
            {(control) => (
              <div className="pp-form__readonly" {...pickAriaProps(control)}>
                {contract.subcontractor_name ?? "—"}
              </div>
            )}
          </Field>
          <Field label="Dönem" required>
            {(control) => (
              <div className="pp-form__period-row">
                <Select
                  {...control}
                  value={periodMonth ?? ""}
                  onChange={(event) => {
                    setPeriodMonth(Number(event.target.value));
                    markPeriodTouched("period_month");
                  }}
                >
                  {PERIOD_MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  numeric
                  aria-label="Hakediş yılı"
                  value={periodYear ?? ""}
                  onChange={(event) => {
                    setPeriodYear(parsePeriodYear(event.target.value));
                    markPeriodTouched("period_year");
                  }}
                />
              </div>
            )}
          </Field>
          <Field label="Şantiye">
            {(control) => (
              <div className="pp-form__readonly" {...pickAriaProps(control)}>
                {site?.name ?? "—"}
              </div>
            )}
          </Field>
          <Field label="Bölüm" hint="Kalemleri filtrelemez — yalnız bilgi alanıdır.">
            {(control) => (
              <Select
                {...control}
                value={sectionId ?? ""}
                onChange={(event) => setSectionId(event.target.value || null)}
              >
                <option value="">Tüm Bölümler</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>

      {/* Kalem tablosu (mockup 65-165) — 6 sabit sütun + tfoot AYNI tablo
          içinde (mockup'ın gerçek yapısı, İşveren'in AYRI kart tfoot'undan
          FARKLI). */}
      <section className="thf-table-card">
        <div className="thf-table-card__head">
          <span>Hakediş Kalemleri</span>
          <span className="thf-table-card__head-note">
            Birim fiyatlar {contract.contract_no ?? "sözleşme"}&apos;den · Sadece miktarları girin
          </span>
        </div>
        <div className="thf-table-scroll">
          <table className="thf-table">
            <thead>
              <tr>
                <th className="thf-table__th">Poz No</th>
                <th className="thf-table__th">Poz Adı</th>
                <th className="thf-table__th thf-table__th--center">Birim</th>
                <th className="thf-table__th thf-table__th--right">Sözleşme B.F.</th>
                <th className="thf-table__th thf-table__th--right">Bu Ay Miktar</th>
                <th className="thf-table__th thf-table__th--right">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map(({ row, showGroupHeader }) => {
                // F-P10 T2: rozetin TEK kaynağı backend'in KALICI
                // `quantity_source` damgasıdır (mockup 87) — oturum-içi
                // türetme KALKTI, işveren tarafıyla aynı desen.
                const isDiaryRow = isDiarySourced(row.quantitySource);
                return (
                  <RowGroup key={row.itemId}>
                    {showGroupHeader && row.groupName && (
                      <tr className="thf-table__group-row">
                        <td colSpan={6}>{row.groupName}</td>
                      </tr>
                    )}
                    <tr className="thf-table__row">
                      <td className="thf-table__td thf-table__td--mono">
                        {row.code}
                        <SourceCodeSub code={row.sourceCode} data-testid="thf-source-code" />
                      </td>
                      <td className="thf-table__td">
                        <div className="thf-table__item-name">{row.description}</div>
                        {isDiaryRow ? (
                          <div
                            className="thf-table__source thf-table__source--diary"
                            data-testid="thf-diary-source"
                          >
                            📅 Günlük kayıttan: {formatTrQuantityText(row.quantity)} {row.unit} hesaplandı
                          </div>
                        ) : (
                          <div className="thf-table__source">Elle giriş</div>
                        )}
                      </td>
                      <td className="thf-table__td thf-table__td--center">{row.unit}</td>
                      <td className="thf-table__td thf-table__td--right thf-table__td--mono">
                        {/* Fix round 1 (kontrolcü bulgusu, Important): eksik
                            (`null`) birim fiyat GERÇEK sıfırdan ayrıştırılır —
                            sessizce "₺ 0" basılmaz, T2'nin zarif düşüş
                            (pending) deseni kullanılır (görünür "—" + title/
                            sr-only, kolon SİLİNMEZ). */}
                        {row.contractUnitPrice !== null ? (
                          formatAmount(row.contractUnitPrice)
                        ) : isAmountHidden ? (
                          // IZN-F4b.2 — fiyat rol için GİZLİ: "eksik fiyat" iddiası YALAN olurdu; "—" + kilit.
                          <span data-testid="thf-masked-price-cell">
                            —<MaskedMark isHidden values={[null]} />
                          </span>
                        ) : (
                          <span
                            className="thf-table__td--pending"
                            title={MISSING_UNIT_PRICE_HINT}
                            data-testid="thf-missing-price-cell"
                          >
                            —<span className="sr-only">{MISSING_UNIT_PRICE_HINT}</span>
                          </span>
                        )}
                      </td>
                      <td className="thf-table__td thf-table__td--right">
                        <span className="thf-table__qty-wrap">
                          <Input
                            size="row"
                            numeric
                            inputMode="decimal"
                            maxLength={18}
                            aria-label={`${row.description} — miktar`}
                            aria-invalid={lineErrors[row.itemId] ? true : undefined}
                            disabled={isSaving}
                            className={isDiaryRow ? "thf-table__qty-input--diary" : undefined}
                            value={row.quantity}
                            onChange={(event) =>
                              updateQuantity(row.itemId, sanitizeTrDecimalInput(event.target.value))
                            }
                          />
                          {isDiaryRow && (
                            <span className="thf-table__qty-tag">Günlük kayıttan ↑</span>
                          )}
                          {lineErrors[row.itemId] && (
                            <span className="thf-table__qty-error" data-testid="thf-qty-error">
                              {lineErrors[row.itemId]}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="thf-table__td thf-table__td--right thf-table__td--mono thf-table__td--strong">
                        {row.lineTotal !== null ? formatAmount(row.lineTotal) : "—"}
                      </td>
                    </tr>
                  </RowGroup>
                );
              })}
            </tbody>
            <tfoot>
              {calcRows.map((calcRow) => (
                <tr
                  key={calcRow.key}
                  className={`thf-tfoot-row${
                    calcRow.key === "gross"
                      ? " thf-tfoot-row--gross"
                      : calcRow.key === "net"
                        ? " thf-tfoot-row--net"
                        : ""
                  }`}
                >
                  <td colSpan={5}>{calcRow.label}</td>
                  <td
                    className={`thf-tfoot-value${calcRow.tone ? ` thf-tfoot-value--${calcRow.tone}` : ""}${
                      calcRow.key === "gross"
                        ? " thf-tfoot-value--gross"
                        : calcRow.key === "net"
                          ? " thf-tfoot-value--net"
                          : ""
                    }`}
                  >
                    {calcRow.value}
                  </td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function groupBySequence(
  rows: readonly SubcontractorLineRow[],
): { row: SubcontractorLineRow; showGroupHeader: boolean }[] {
  return rows.map((row, index) => ({
    row,
    showGroupHeader: index === 0 || rows[index - 1].groupName !== row.groupName,
  }));
}

function pickAriaProps(control: { id: string; "aria-describedby"?: string }) {
  return { id: control.id, "aria-describedby": control["aria-describedby"] };
}

/**
 * "Hakediş yılı" alanı için Türkçe koruma (`ProgressPaymentForm`taki
 * `parsePeriodYear` ile AYNI karar): boş/sayısal olmayan girişte `null`
 * döner — uydurma bir `0` gövdeye asla sızmaz.
 */
function parsePeriodYear(raw: string): number | null {
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function changedLineIds(before: readonly SubcontractorLineRow[], after: readonly SubcontractorLineRow[]): string[] {
  const previous = new Map(before.map((row) => [row.itemId, row.quantity]));
  return after.filter((row) => previous.get(row.itemId) !== row.quantity).map((row) => row.itemId);
}
