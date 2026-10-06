"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CalendarCheckIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useContractDistribution, useEmployerContract } from "@/lib/api/hooks/useContract";
import { useEmployerDiarySuggestion } from "@/lib/api/hooks/useDiarySuggestion";
import {
  useCreateProgressPayment,
  useRefreshProgressPaymentPrices,
  useReplaceProgressPaymentLines,
  useUpdateProgressPayment,
} from "@/lib/api/hooks/useProgressPaymentMutations";
import { useProgressPayment } from "@/lib/api/hooks/useProgressPayments";
import { useProject } from "@/lib/api/hooks/useProjects";
import { isForbidden } from "@/lib/api/unwrap";
import { EMPLOYER_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { PERIOD_MONTHS, formatPercent } from "@/lib/format";
import { toDecimalString } from "@/lib/decimal";
import { trQuantityInputValue } from "@/components/contracts/employer-item-inline";
import { asPercent } from "@/lib/api/scale";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { DiaryFillFeedback } from "./DiaryFillFeedback";
import { PaymentCalculationCard } from "./PaymentCalculationCard";
import { PaymentFormPivotTable } from "./PaymentFormPivotTable";
import { ProgressPaymentStatusActions } from "./ProgressPaymentStatusActions";
import { applyEmployerDiarySuggestion } from "./diary-fill";
import {
  formatTrQuantityText,
  parsePaymentCoefficient,
  sanitizeTrDecimalInput,
} from "./tr-quantity";
import { omitKeys } from "./omit-keys";
import { periodFields, type OmittablePeriodField } from "./period-fields";
import { useDiaryFill } from "./useDiaryFill";
import {
  buildLinesSaveBody,
  buildPivotRows,
  cellKey,
  findOrphanedAllocationCells,
  normalizePivotRowsForSave,
  type PivotRow,
} from "./pivot";
import "./progress-payment-form.css";
import { routes } from "@/lib/routes";

export type ProgressPaymentFormProps =
  | { mode: "create"; projectId: string }
  | { mode: "edit"; paymentId: string };

const DEFAULT_COEFFICIENT_WHEN_LOCKED = "1";
/** "10,000" — katsayı üst sınırı 10 (T43), 3 ondalık. */
const COEFFICIENT_INPUT_MAX_LENGTH = 10;

/**
 * Hakediş oluştur/düzenle formu (P7 T5). `create` ve `edit` kipleri AYNI
 * bileşendir (brief §Rotalar) — iki kopya form YOK.
 *
 * Kaydetme yolu (brief §Belirsizlik çözümü 3, kontrolcü kararı):
 * - `create`: TEK atomik `POST` — başlık + satırlar birlikte gönderilir
 *   (`ProgressPaymentCreate.lines`). Şema açıklaması bunu açıkça destekliyor
 *   ("Satırlar iç içe ve atomik gönderilebilir") — iki adımlı POST→PUT akışı
 *   ara adımda ağ hatası olursa yetim (satırsız) bir taslak bırakabilirdi;
 *   atomik yol bu riski taşımaz.
 * - `edit`: başlık alanları yalnız `PATCH` (`ProgressPaymentUpdate` satır
 *   TAŞIMAZ), satırlar yalnız `PUT …/lines` ile değişir — iki uç ayrı
 *   kaynaklara yazdığı için sırayla çağrılır (PATCH önce, başarısız olursa
 *   PUT hiç denenmez — kısmi kaydetme belirsizliği bırakmaz).
 */
export function ProgressPaymentForm(props: ProgressPaymentFormProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const detailQuery = useProgressPayment(isEdit ? props.paymentId : "");
  const detail = isEdit ? detailQuery.data : undefined;

  const resolvedProjectId = isEdit ? (detail?.project_id ?? "") : props.projectId;
  // IZN-F2.x · hakediş oluştur/düzenle = işveren hakediş ailesi Düzenler (IZN-F5b, HI); IZN-F3.2b · o projedeki rolden.
  const canWrite = useButtonGate({
    pages: EMPLOYER_PAYMENT_EDIT,
    need: "edit",
    projectId: resolvedProjectId,
  });
  const projectQuery = useProject(resolvedProjectId);
  const distributionQuery = useContractDistribution(resolvedProjectId);
  const contractQuery = useEmployerContract(resolvedProjectId);

  const createPayment = useCreateProgressPayment();
  const updatePayment = useUpdateProgressPayment();
  const replaceLines = useReplaceProgressPaymentLines();
  const refreshPrices = useRefreshProgressPaymentPrices();

  const [rows, setRows] = useState<PivotRow[] | null>(null);
  const [periodYear, setPeriodYear] = useState<number | null>(null);
  const [periodMonth, setPeriodMonth] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [defaultCoefficient, setDefaultCoefficient] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);
  // TKL-F8 · görünür alan hataları (kayıt denemesinde dolar; ilgili alan düzenlenince temizlenir).
  const [cellErrors, setCellErrors] = useState<Readonly<Record<string, string>>>({});
  const [coefficientError, setCoefficientError] = useState<string | null>(null);
  // no 179 · `edit` kaydetmesi PATCH-SONRA-PUT sıralıdır: PATCH başarılı olup
  // PUT (satırlar) PATLARSA başlık zaten sunucuda kaydedilmiştir ve geri
  // alma (rollback) YOKTUR. `formError` sunucunun ham cümlesini taşımaya
  // devam eder (mevcut testler bunu birebir bekler); bu bayrak AYRI bir
  // bantla kullanıcıya "başlık kaydedildi, satırlar kaydedilmedi" der.
  const [headerSavedLinesFailed, setHeaderSavedLinesFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  // SEKME-F1.3-FIX O4 · `dirty` yalnız satır/hücre değişikliklerini (ve
  // "Günlükten Doldur"u) yönetiyordu — açıklama/dönem/katsayı gibi başlık
  // alanları `setDirty(true)` ÇAĞIRMIYORDU, üst çubuk onayı bu değişiklikleri
  // GÖREMEZDİ. Kayda giden ifade artık başlık alanlarının tohumlanan
  // (`initialHeaderRef`, veri geldikten SONRA alınan) başlangıç değerinden
  // SAPTIĞINI da kapsar; sapma kaydetme başarıyla bitince ref güncellenerek
  // kapanır (bkz. `handleSave` içindeki `resetHeaderBaseline`).
  const [headerBaseline, setHeaderBaseline] = useState<{
    description: string;
    coefficient: string;
    year: number;
    month: number;
  } | null>(null);
  const headerDirty =
    headerBaseline !== null &&
    (description !== headerBaseline.description ||
      defaultCoefficient !== headerBaseline.coefficient ||
      periodYear !== headerBaseline.year ||
      periodMonth !== headerBaseline.month);
  useUnsavedChanges(dirty || headerDirty, "Hakediş");
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);
  // Kullanıcının GERÇEKTEN dokunduğu dönem alanları. Mockup'ta ay seçicisinin
  // boş seçeneği yoktur, ekranda hep dolu görünür ve "görünen değer"
  // kullanıcının KARARI DEĞİLDİR (bkz. `omittedPeriodFields`).
  const [touchedPeriodFields, setTouchedPeriodFields] = useState<
    ReadonlySet<OmittablePeriodField>
  >(() => new Set());

  // Tohumlama (seed) YALNIZ BİR KEZ çalışır — sonraki `detailQuery`/`distributionQuery`
  // yenilemeleri (ör. kaydetme sonrası invalidation) kullanıcının o anki
  // düzenlemesini SİLMEZ. `refresh-prices` başarısı istisnadır, aşağıda ayrı
  // ele alınır (`handleRefreshPrices`).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!distributionQuery.data) return;
    if (isEdit && !detail) return;
    seededRef.current = true;
    const seedYear = detail?.period_year ?? new Date().getFullYear();
    const seedMonth = detail?.period_month ?? new Date().getMonth() + 1;
    const seedDescription = detail?.description ?? "";
    // TKL-F8: katsayı alanı EKRAN METNİDİR (Türkçe) — sunucu "1.050" → "1,05".
    const seedCoefficient = trQuantityInputValue(detail?.default_coefficient ?? "1");
    setRows(buildPivotRows(distributionQuery.data, detail?.lines ?? []));
    setPeriodYear(seedYear);
    setPeriodMonth(seedMonth);
    setDescription(seedDescription);
    setDefaultCoefficient(seedCoefficient);
    setHeaderBaseline({
      description: seedDescription,
      coefficient: seedCoefficient,
      year: seedYear,
      month: seedMonth,
    });
  }, [distributionQuery.data, detail, isEdit]);

  // "Günlükten Doldur" (spec §4). Öneri ekran açılışında ÇEKİLMEZ
  // (`enabled: false`) — kullanıcı butona bastığında `refetch` ile alınır;
  // dönem alanları öneriye query paramı olarak geçer, yani form hangi ayı
  // gösteriyorsa önerinin ayı da odur.
  const diarySuggestionQuery = useEmployerDiarySuggestion(resolvedProjectId, {
    year: periodYear ?? undefined,
    month: periodMonth ?? undefined,
    enabled: false,
  });
  const diaryFill = useDiaryFill({
    fetchSuggestion: () => diarySuggestionQuery.refetch(),
    apply: (lines) => applyEmployerDiarySuggestion(rows ?? [], lines),
    commit: (application) => {
      // Doldurmanın DEĞİŞTİRDİĞİ hücrelerin hatası kalkar; değişmeyen hatalı hücrenin hatası kalır.
      const changedKeys = changedCellKeys(rows ?? [], application.rows);
      setCellErrors((prev) => omitKeys(prev, changedKeys));
      setRows(application.rows);
      setDirty(true);
    },
  });

  if (!canWrite) return <AccessDenied />;
  if (isForbidden(detailQuery.error) || isForbidden(distributionQuery.error) || isForbidden(contractQuery.error)) {
    return <AccessDenied />;
  }

  if (isEdit && (detailQuery.isLoading || !detail)) {
    return <p className="pp-form__message">Yükleniyor…</p>;
  }

  // Düzenleme yalnız `draft` durumunda anlamlıdır (brief §Rotalar) — sessizce
  // boş form gösterilmez, Türkçe uyarı + detaya dönüş linki basılır.
  if (isEdit && detail && detail.status !== "draft") {
    return (
      <div className="pp-form">
        <Alert variant="warning" className="pp-form__alert">
          Bu hakediş artık taslak durumunda değil, düzenlenemez.
        </Alert>
        <Link href={routes.progressPayments.detail({ paymentId: detail.id })} className="pp-form__crumb-link">
          ← Hakediş detayına dön
        </Link>
      </div>
    );
  }

  if (distributionQuery.isError) {
    return (
      <Alert variant="danger" className="pp-form__alert">
        {backendErrorMessage(distributionQuery.error, "Poz dağılımı yüklenemedi.")}
      </Alert>
    );
  }
  if (contractQuery.isError) {
    return (
      <Alert variant="danger" className="pp-form__alert">
        {backendErrorMessage(contractQuery.error, "Sözleşme bilgisi yüklenemedi.")}
      </Alert>
    );
  }
  if (
    distributionQuery.isLoading ||
    contractQuery.isLoading ||
    !distributionQuery.data ||
    !contractQuery.data ||
    rows === null
  ) {
    return <p className="pp-form__message">Yükleniyor…</p>;
  }

  const distribution = distributionQuery.data;
  const contract = contractQuery.data;
  const hasPriceEscalation = contract.has_price_escalation;
  const isSaving = createPayment.isPending || updatePayment.isPending || replaceLines.isPending;

  function updateCellQuantity(itemId: string, siteId: string, value: string) {
    setDirty(true);
    setCellErrors((prev) => {
      const key = cellKey(itemId, siteId);
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setRows((prev) =>
      (prev ?? []).map((row) =>
        row.item.id !== itemId
          ? row
          : {
              ...row,
              cells: row.cells.map((cell) =>
                cell.siteId !== siteId ? cell : { ...cell, quantity: value },
              ),
            },
      ),
    );
  }

  function markPeriodTouched(field: OmittablePeriodField) {
    setTouchedPeriodFields((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  }

  /**
   * PATCH gövdesinden ATLANACAK dönem alanları.
   *
   * "Hakediş Dönemi" ay seçicisi mockup'ta boş seçenek TAŞIMAZ
   * (`İşveren Hakediş Oluştur.dc.html:82`): sunucuda `null` olsa bile ekranda
   * dolu bir dönem görünür ve tohumlama `??` ile BUGÜNÜN ay/yılını basar.
   * Kullanıcı dönemi hiç SEÇMEDEN kaydederse anahtarı göndermek, kullanıcının
   * VERMEDİĞİ bir dönem kararını PARA kaydına yazmak olurdu — sunucudaki `null`
   * sessizce EZİLİRDİ (yanlış dönem = maliyet/gelir yanlış aya düşer). Bu yüzden
   * "sunucuda null + dokunulmamış" durumunda anahtar hiç basılmaz.
   *
   * Dolu gelen dönem zaten tohumlanmıştır ve normal gider; kullanıcı dokunduysa
   * seçimi normal gider. OLUŞTURMA kipi etkilenmez: orada ezilecek sunucu
   * değeri YOKTUR.
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

  // Kilitliyken (fiyat farkı yok) metin okunmaz: gövdeye sabit "1" gider (davranış aynen).
  function parseCoefficientToSend() {
    return hasPriceEscalation
      ? parsePaymentCoefficient(defaultCoefficient)
      : ({ kind: "ok", value: DEFAULT_COEFFICIENT_WHEN_LOCKED } as const);
  }

  // no 180 · ikiz taşeron formuyla (`SubcontractorProgressPaymentForm
  // ::validateHeader`) AYNI kontrol — dönem seçimi olmadan istek UÇMAZ.
  function validateHeader(): string | null {
    if (periodYear === null || periodMonth === null) return "Dönem seçimi zorunludur.";
    return null;
  }

  function handleSave() {
    setFormError(null);
    setHeaderSavedLinesFailed(false);
    const validationError = validateHeader();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    // Kaydetmeden HEMEN önce hücre metinleri Türkçe okunur ve nokta-ondalık metne çevrilir
    // (TKL-F8 · T30): boş → "0", okunamayan hücre görünür hata + İSTEK GİTMEZ. `buildLinesSaveBody`nin
    // KENDİSİ değiştirilmedi, kritik testleri korunur (bkz. `pivot.ts`).
    const normalized = normalizePivotRowsForSave(rows ?? []);
    const coefficient = parseCoefficientToSend();
    setCellErrors(normalized.errors);
    setCoefficientError(coefficient.kind === "error" ? coefficient.message : null);
    if (coefficient.kind === "error" || Object.keys(normalized.errors).length > 0) return;
    const linesBody = buildLinesSaveBody(normalized.rows);
    const headerBody = {
      ...periodFields(periodYear, periodMonth, omittedPeriodFields),
      description: description.trim() ? description.trim() : null,
      default_coefficient: coefficient.value,
    };

    if (props.mode === "create") {
      createPayment.mutate(
        { projectId: props.projectId, body: { ...headerBody, lines: linesBody } },
        {
          onSuccess: (data) => router.push(routes.progressPayments.detail({ paymentId: data.id })),
          onError: (err) => setFormError(backendErrorMessage(err, "Hakediş oluşturulamadı.")),
        },
      );
      return;
    }

    // Kaydetme ANINDAKİ başlık değerleri — başarı geldiğinde kayıt (registry)
    // bu değerleri yeni "temiz" başlangıç kabul eder (bkz. `headerDirty`).
    const savedYear = periodYear;
    const savedMonth = periodMonth;
    const savedDescription = description;
    const savedCoefficient = defaultCoefficient;
    function resetHeaderBaseline() {
      if (savedYear === null || savedMonth === null) return;
      setHeaderBaseline({
        description: savedDescription,
        coefficient: savedCoefficient,
        year: savedYear,
        month: savedMonth,
      });
    }

    const paymentId = props.paymentId;
    updatePayment.mutate(
      { paymentId, body: headerBody },
      {
        onSuccess: () => {
          replaceLines.mutate(
            { paymentId, body: { lines: linesBody } },
            {
              onSuccess: () => {
                setDirty(false);
                resetHeaderBaseline();
              },
              onError: (err) => {
                // no 179 · başlık ZATEN sunucuda kaydedildi (PATCH başarılıydı);
                // geri alma yok — kullanıcı kısmi kayıt durumunu görmeli.
                setHeaderSavedLinesFailed(true);
                setFormError(backendErrorMessage(err, "Hakediş satırları kaydedilemedi."));
              },
            },
          );
        },
        onError: (err) => setFormError(backendErrorMessage(err, "Hakediş güncellenemedi.")),
      },
    );
  }

  function runRefreshPrices() {
    if (!isEdit) return;
    setFormError(null);
    refreshPrices.mutate(props.paymentId, {
      onSuccess: async () => {
        setRefreshConfirmOpen(false);
        const fresh = await detailQuery.refetch();
        if (fresh.data) {
          setRows(buildPivotRows(distribution, fresh.data.lines));
          // Satırlar sunucudan yeniden kuruldu: eski hücre hataları artık geçersiz.
          setCellErrors({});
          setDirty(false);
        }
      },
      onError: (err) => setFormError(backendErrorMessage(err, "Fiyatlar tazelenemedi.")),
    });
  }

  function handleRefreshPricesClick() {
    if (dirty) {
      setRefreshConfirmOpen(true);
      return;
    }
    runRefreshPrices();
  }

  const staleLines = (detail?.lines ?? []).filter((line) => line.is_price_stale === true);
  // FİNAL İNCELEME düzeltmesi #2: tahsisi sonradan kaldırılmış ama kayıtlı
  // miktarı olan hücreler — "Taslak Kaydet" bunları PUT gövdesinden düşürür,
  // yani sunucuda SİLİNİR. Kaydetmeden ÖNCE görünür uyarı basılır (bkz.
  // `findOrphanedAllocationCells` yorumu, `pivot.ts`).
  const orphanedCells = findOrphanedAllocationCells(rows, distribution.sites);

  return (
    <div className="pp-form">
      <p className="pp-form__crumb">
        <Link href={routes.progressPayments.list()} className="pp-form__crumb-link">
          ← Hakedişler
        </Link>
        {" · İşveren Hakediş "}
        {isEdit && detail ? `#${detail.sequence_no} Düzenle` : "Oluştur"}
        {projectQuery.data && ` · ${projectQuery.data.name}`}
      </p>

      <div className="pp-form__title-row">
        <h1 className="pp-form__title">
          {isEdit && detail ? `İşveren Hakediş #${detail.sequence_no}` : "İşveren Hakediş Oluştur"}
        </h1>
        <div className="pp-form__title-actions">
          {isEdit && detail && <ProgressPaymentStatusActions detail={detail} />}
          {/* Spec §4 (kullanıcı kararı S5) — mockup'ta olmayan ONAYLI ek
              aksiyon; görsel dil formun mevcut ikincil butonlarıyla
              ("Fiyatları Tazele") AYNI, icat edilmiş stil yok. */}
          <Button
            variant="secondary"
            onClick={diaryFill.run}
            disabled={isSaving || diaryFill.isPending}
            data-testid="pp-form-diary-fill"
          >
            <CalendarCheckIcon />
            {diaryFill.isPending ? "Günlük okunuyor…" : "Günlükten Doldur"}
          </Button>
          <Button variant="secondary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Kaydediliyor…" : "Taslak Kaydet"}
          </Button>
        </div>
      </div>

      <div className="pp-form__info">
        <span aria-hidden="true">📋</span>
        <div>
          <strong>İşveren hakedişinde birim fiyatlar sözleşmeden sabit gelir.</strong> Sözleşmenizde
          fiyat farkı şartı varsa, Fiyat Farkı Katsayısı girerek düzeltilmiş birim fiyat otomatik
          hesaplanır. Katsayı 1 ise fiyat farkı yok demektir.
        </div>
      </div>

      {distribution.undistributed_item_count > 0 && (
        <Alert variant="warning" className="pp-form__alert" data-testid="pp-form-undistributed-alert">
          {distribution.undistributed_item_count} poz henüz hiçbir şantiyeye dağıtılmadı:{" "}
          {distribution.undistributed_item_names.join(", ")}. Bu pozlar bu hakedişte
          düzenlenemez — önce poz dağılımını tamamlayın.
        </Alert>
      )}

      {staleLines.length > 0 && (
        <Alert variant="warning" className="pp-form__alert" data-testid="pp-form-stale-price-alert">
          {staleLines.length} satırın birim fiyatı sözleşmeden bu yana değişmiş olabilir (bayat
          fiyat). Güncel fiyatları uygulamak için &quot;Fiyatları Tazele&quot; kullanın.
        </Alert>
      )}

      {/* FİNAL İNCELEME düzeltmesi #2: tahsisi kaldırılmış ama kayıtlı
          hücreler — kaydetmeden ÖNCE hangi poz/şantiyenin kaybolacağını
          Türkçe açıkça söyler; sessiz veri kaybı önlenir. */}
      {orphanedCells.length > 0 && (
        <Alert variant="warning" className="pp-form__alert" data-testid="pp-form-orphaned-alert">
          {orphanedCells.length} satırın tahsisi bu şantiyeden kaldırılmış — kaydedince bu
          satırlar SİLİNECEK:{" "}
          {orphanedCells
            .map((cell) => `${cell.item.code} — ${cell.siteName} (${formatTrQuantityText(cell.quantity)})`)
            .join(", ")}
          .
        </Alert>
      )}

      {formError && (
        <Alert variant="danger" className="pp-form__alert" data-testid="pp-form-error">
          {formError}
        </Alert>
      )}

      {headerSavedLinesFailed && (
        <Alert
          variant="warning"
          className="pp-form__alert"
          data-testid="pp-form-header-saved-lines-failed"
        >
          Hakediş başlığı KAYDEDİLDİ; satırlar kaydedilemedi — tekrar deneyin.
        </Alert>
      )}

      <DiaryFillFeedback
        notice={diaryFill.notice}
        confirmOverwriteCount={diaryFill.confirmOverwriteCount}
        onConfirmOverwrite={diaryFill.confirmOverwrite}
        onCancelOverwrite={diaryFill.cancelOverwrite}
        testIdPrefix="pp-form"
      />

      {/* Fiyat Farkı bandı — SALT OKUNUR (brief §Form üst bölümü, kullanıcı
          kararı S3): açma/kapama YOK, `has_price_escalation` sözleşmeden
          gelir. Endeks seçici basılmıyor (`index_type` şemada yok). */}
      <div className="pp-form__ff-band" data-testid="pp-form-ff-band">
        <span>Fiyat Farkı: {hasPriceEscalation ? "Var" : "Yok"}</span>
        <div className="pp-form__ff-coefficient">
          <Field label="Katsayı (Dn/D0)" size="md" error={hasPriceEscalation ? coefficientError : null}>
            {(control) => (
              <Input
                {...control}
                size="row"
                numeric
                inputMode="decimal"
                maxLength={COEFFICIENT_INPUT_MAX_LENGTH}
                value={hasPriceEscalation ? defaultCoefficient : DEFAULT_COEFFICIENT_WHEN_LOCKED}
                disabled={!hasPriceEscalation}
                onChange={(event) => {
                  setCoefficientError(null);
                  setDefaultCoefficient(sanitizeTrDecimalInput(event.target.value));
                }}
              />
            )}
          </Field>
        </div>
        {hasPriceEscalation && (
          <span className="pp-form__ff-pct">{coefficientPercentLabel(defaultCoefficient)}</span>
        )}
        {!hasPriceEscalation && (
          <span className="pp-form__ff-hint">
            Bu sözleşmede fiyat farkı şartı yok — katsayı 1&apos;de kilitli.
          </span>
        )}
      </div>

      <div className="pp-form__header-card">
        <div className="pp-form__header-grid">
          <Field label="İşveren">
            {(control) => (
              <div className="pp-form__readonly" {...pickAriaProps(control)}>
                {contract.employer_name ?? "—"}
              </div>
            )}
          </Field>
          <Field label="Hakediş Dönemi">
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
          <Field label="Kapsam">
            {(control) => (
              <div className="pp-form__readonly" {...pickAriaProps(control)}>
                {distribution.sites.map((s) => s.name).join(" + ") || "—"}
              </div>
            )}
          </Field>
          <Field label="Hakediş No">
            {(control) => (
              <div className="pp-form__readonly" {...pickAriaProps(control)}>
                {isEdit && detail ? `#${detail.sequence_no}` : "Kaydedince atanır"}
              </div>
            )}
          </Field>
          <Field label="Açıklama" className="pp-form__header-grid-full">
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </Field>
        </div>
      </div>

      <PaymentFormPivotTable
        sites={distribution.sites}
        rows={rows}
        disabled={isSaving}
        cellErrors={cellErrors}
        onQuantityChange={updateCellQuantity}
      />

      {/* Mockup 177-200'deki tfoot toplamları (TOPLAM HAKEDİŞ/KDV/Avans/
          Teminat/NET) burada YENİDEN YAZILMAZ — T3'te yazılan
          `PaymentCalculationCard` aynen içe aktarılır (kontrolcü düzeltmesi:
          `detail.calculation` yetkili toplamdır, brief §tfoot). YALNIZ edit
          kipinde basılır: create kipinde henüz kaydedilmiş bir hakediş
          olmadığından `calculation` YOKTUR — backend'in hesaplamadığı bir
          toplamı client'ta uydurmak (çarpma gerektirir) float riskidir, bu
          yüzden create kipinde bilerek HİÇ toplam basılmaz. */}
      {isEdit && detail && <PaymentCalculationCard detail={detail} />}

      <div className="pp-form__actions">
        {isEdit && detail && detail.status === "draft" && (
          <Button
            variant="secondary"
            onClick={handleRefreshPricesClick}
            disabled={refreshPrices.isPending}
            data-testid="pp-form-refresh-prices"
          >
            {refreshPrices.isPending ? "Tazeleniyor…" : "Fiyatları Tazele"}
          </Button>
        )}
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Kaydediliyor…" : "Taslak Kaydet"}
        </Button>
      </div>

      {refreshConfirmOpen && (
        <ConfirmDialog
          title="Fiyatları Tazele"
          message="Kaydedilmemiş miktar değişiklikleriniz var. Fiyatları tazelemek satırları sunucudaki son kayıtlı hâline döndürür, kaydedilmemiş girdileriniz kaybolur. Devam edilsin mi?"
          confirmLabel="Tazele"
          danger
          isPending={refreshPrices.isPending}
          onConfirm={runRefreshPrices}
          onClose={() => setRefreshConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function changedCellKeys(before: readonly PivotRow[], after: readonly PivotRow[]): string[] {
  const previous = new Map<string, string>();
  for (const row of before) {
    for (const cell of row.cells) previous.set(cellKey(row.item.id, cell.siteId), cell.quantity);
  }
  const changed: string[] = [];
  for (const row of after) {
    for (const cell of row.cells) {
      const key = cellKey(row.item.id, cell.siteId);
      if (previous.get(key) !== cell.quantity) changed.push(key);
    }
  }
  return changed;
}

// `Field`in render-prop `control`ünden yalnız aria/`id` alanlarını salt-okunur
// gösterim `div`ine geçirir — `<input>` olmadığından `value`/`onChange` yok.
function pickAriaProps(control: { id: string; "aria-describedby"?: string }) {
  return { id: control.id, "aria-describedby": control["aria-describedby"] };
}

/**
 * `(katsayı − 1) × 100` yüzde rozeti (brief: "1,05 → %5") — yalnız GÖSTERİM
 * amaçlı, kaydedilen hiçbir alanı etkilemez. `formatPercent`i YENİDEN
 * KULLANIR (kod tabanındaki tüm yüzde alanları — `vat_pct`, `advance_pct` —
 * aynı şekilde `Number()` tabanlıdır, bkz. `PaymentCalculationCard`); bu
 * dosyada ikinci bir yüzde biçimlendirici YAZILMAZ. Para/miktar KAYDETME
 * yolunda float YASAK kuralı burada ihlal edilmiyor — hesaplanan değer
 * hiçbir API gövdesine yazılmıyor, yalnız ekrana basılıyor.
 */
/**
 * "Hakediş yılı" alanı için Türkçe koruma (kontrolcü bulgusu §2): ham
 * `Number(event.target.value)` boş girişte `0` üretiyordu ve bu `0` gövdeye
 * `period_year: 0` olarak sızabiliyordu. Boş VEYA sayısal olmayan girişte
 * `null` döner — `period_year` şemada nullable olduğundan bu alan gövdede
 * "gönderilmemiş" (boş) olarak kalır, uydurma bir `0` asla gitmez.
 */
function parsePeriodYear(raw: string): number | null {
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function coefficientPercentLabel(coefficient: string): string {
  // TKL-F8: alan metni TÜRKÇEDİR ("1,05") — `Number()`a ham metin verilmez, T30 ile okunur.
  // Okunamayan ara hal (yazım sürüyor / hatalı) %0 basar; hata alanın altında ayrıca görünür.
  const parsed = parsePaymentCoefficient(coefficient);
  const value = parsed.kind === "ok" ? Number(parsed.value) : Number.NaN;
  // KAÇIŞ: yalnız gösterim amaçlı türetilmiş katsayı yüzdesi (yorum yukarıda);
  // formatPercent sınırında Decimal kanonuyla stringe çevriliyor.
  if (!Number.isFinite(value)) return formatPercent(asPercent("0"));
  return formatPercent(asPercent(toDecimalString((value - 1) * 100) ?? "0"));
}
