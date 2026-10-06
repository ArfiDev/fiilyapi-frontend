"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Checkbox, DateInput, Field, Input, Select, Textarea } from "@/components/ui";
import { isoDate } from "@/components/site-diary/derive";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import { useEmployers } from "@/lib/api/hooks/useEmployers";
import {
  useProgressPayments,
  type ProgressPaymentListItem,
} from "@/lib/api/hooks/useProgressPayments";
import {
  useCreateInvoice,
  useInvoiceAction,
  type InvoiceCreateRequest,
} from "@/lib/api/hooks/useInvoiceMutations";
import { INVOICING_EDIT, INVOICING_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { formatAmount, formatPeriod } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { InvoiceLinesEditor } from "./InvoiceLinesEditor";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_OPTIONS,
  INVOICE_PAYMENT_METHOD_LABELS,
  INVOICE_PAYMENT_METHOD_OPTIONS,
  INVOICES_URL,
  invoiceDetailUrl,
  REASONS,
} from "./invoice-labels";
import { computeAmountPreview } from "./invoice-amount-preview";
import { buildLines, emptyLineDraft, type InvoiceLineDraft } from "./invoice-line-math";
import "./invoices.css";

type SourceKind = "progress_payment" | "purchase_order" | "manual";

/** "Elle gir" seçeneği — alıcı listede yoksa `party_name` serbest metindir. */
/**
 * 🔴 `InvoiceCreate.advance_rate` · `retention_rate` · `withholding_rate` —
 * üçünün de sözleşme aralığı **0..100**dür (`form-limits.contract.test.ts`
 * ölçer). İstemcide hiçbiri denetlenmiyordu: 150 yazan kullanıcı UYARISIZ
 * 422 alıyordu.
 */
const INVOICE_RATE_MIN = 0;
const INVOICE_RATE_MAX = 100;

const MANUAL_PARTY = "__manual__";

/**
 * FK:88-90 hakediş seçeneği. `period_year`/`period_month` sunucuda NULL
 * olabilir (dönemsiz hakediş meşrudur) — o hâlde dönem parçası SESSİZCE
 * atlanmaz, "dönemsiz" yazılır.
 */
function progressPaymentOptionLabel(item: ProgressPaymentListItem): string {
  const period =
    item.period_year !== null && item.period_month !== null
      ? formatPeriod(item.period_year, item.period_month)
      : "dönemsiz";
  return `Hakediş #${item.sequence_no} — ${item.project_name} · ${period} · ${formatAmount(
    item.gross_total,
  )}`;
}

/** Değeri hesaplanamayan hücre — mockup FK:237 de aynı işareti basar. */
const UNKNOWN = "—";

/**
 * FK:225/231/237 kesinti TUTARI sütunu. `amount === null` → kutu işaretli
 * değil ya da önizleme hesaplanamadı; mockup'ın kendi "—" hücresi basılır.
 */
function DeductionAmount({ amount, testId }: { amount: string | null; testId: string }) {
  if (amount === null) {
    return (
      <span
        className="fat-deduction__amount fat-deduction__amount--muted"
        data-testid={testId}
        title={REASONS.previewOnly}
      >
        {UNKNOWN}
      </span>
    );
  }
  return (
    <span className="fat-deduction__amount" data-testid={testId} title={REASONS.previewOnly}>
      – {formatAmount(amount)}
    </span>
  );
}

/**
 * FK:249 başlığı. Mockup tek oran çizer ("KDV (%20)") ama kalem tablosu KDV
 * oranını SATIR BAZINDA taşır (FK:182) — çok oranlı faturada tek bir oran
 * yazmak YALAN olurdu.
 */
function vatLabel(rates: readonly string[]): string {
  if (rates.length === 0) return "KDV";
  if (rates.length === 1) return `KDV (%${rates[0]})`;
  return `KDV (karma oran: %${rates.join(" · %")})`;
}

/**
 * FK · `/faturalar/kes` — mockup `Fatura - Kes.dc.html` (kanonik). Yorumlardaki
 * sayılar O dosyanın SATIR numaralarıdır.
 *
 * ⚠️ VERİ KAYNAKLARI (T3 için): işveren listesi (alıcı seçici) · onaylı hakediş
 * listesi. İkisi de kendi hata yolunu işletir.
 *
 * 🔴 TUTARLAR ÖNİZLEMEDİR, OTORİTE DEĞİL. FK:225-250 rakamları
 * `invoice-amount-preview.ts` ile hesaplanır; o modül backend
 * `invoicing/amounts.py`in PORTUDUR (ikisi de aynı yedi adımı, aynı sırayla,
 * aynı `ROUND_HALF_UP` ile koşar ve backend'in kendi test fixture'larıyla
 * kilitlenmiştir). Kaydedilen değerleri yine SUNUCU yazar; bu ekran yalnız
 * kullanıcı "Kaydet"e basmadan önce ne olacağını gösterir ve bunu ekranda
 * açıkça söyler (`REASONS.previewOnly`).
 */
export function InvoiceCreateView() {
  const router = useRouter();
  const canViewInvoicing = useButtonGate({ pages: INVOICING_VIEW, need: "view" });
  // IZN-F2.x · fatura oluştur/düzenle = mali.fatura Düzenler.
  const canEditInvoice = useButtonGate({ pages: INVOICING_EDIT, need: "edit" });

  const [today] = useState(() => new Date());
  const [source, setSource] = useState<SourceKind>("manual");
  const [progressPaymentId, setProgressPaymentId] = useState("");

  const [partySelection, setPartySelection] = useState(MANUAL_PARTY);
  const [partyName, setPartyName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [taxOffice, setTaxOffice] = useState("");
  const [address, setAddress] = useState("");
  const [issueDate, setIssueDate] = useState(() => isoDate(today));
  const [dueDate, setDueDate] = useState("");
  const [documentType, setDocumentType] =
    useState<InvoiceCreateRequest["document_type"]>("einvoice");
  const [paymentMethod, setPaymentMethod] = useState("transfer");
  const [note, setNote] = useState("");

  const [lines, setLines] = useState<InvoiceLineDraft[]>(() => [emptyLineDraft("l1")]);
  const [lineSeq, setLineSeq] = useState(1);

  const [advanceOn, setAdvanceOn] = useState(false);
  const [advanceRate, setAdvanceRate] = useState("20"); // FK:224
  const [retentionOn, setRetentionOn] = useState(false);
  const [retentionRate, setRetentionRate] = useState("5"); // FK:230
  const [withholdingOn, setWithholdingOn] = useState(false);
  const [withholdingRate, setWithholdingRate] = useState("20"); // FK:236

  const [formError, setFormError] = useState<string | null>(null);

  const employersQuery = useEmployers({ activeOnly: true });
  const progressPaymentsQuery = useProgressPayments({ status: "approved" });
  const createMutation = useCreateInvoice();
  const actionMutation = useInvoiceAction();

  // SEKME-F1.3b · dirty = başlangıç değerinden herhangi bir alanın sapması
  // (tercih 2). `issueDate` bilerek DIŞARIDA: `today`den TEK yerde senkron
  // türer, kullanıcı dokunmadan hep dolu — dahil edilirse form hep "kirli"
  // görünürdü. Bir satırın "dokunulmamış" hâli `emptyLineDraft` iledir.
  const isDirty =
    source !== "manual" ||
    progressPaymentId !== "" ||
    partySelection !== MANUAL_PARTY ||
    partyName !== "" ||
    taxNumber !== "" ||
    taxOffice !== "" ||
    address !== "" ||
    dueDate !== "" ||
    documentType !== "einvoice" ||
    paymentMethod !== "transfer" ||
    note !== "" ||
    lines.length > 1 ||
    lines.some(
      (line) =>
        line.description !== "" ||
        line.unit !== "" ||
        line.quantity !== "" ||
        line.unitPrice !== "" ||
        line.vatRate !== "20",
    ) ||
    advanceOn ||
    retentionOn ||
    withholdingOn;
  useUnsavedChanges(isDirty, "Fatura");

  // InvoicesView.tsx / InvoiceDetailView.tsx deseniyle AYNI: istemci izin
  // matrisi yeterli değildir, sunucunun ANLIK 403'ü de AccessDenied'e döner
  // (O5a-131 — rol/kapsam sunucuda değişmiş olabilir).
  if (
    !canViewInvoicing ||
    isForbidden(employersQuery.error) ||
    isForbidden(progressPaymentsQuery.error)
  ) {
    return <AccessDenied />;
  }

  const busy = createMutation.isPending || actionMutation.isPending;
  // FK:246-250 — backend `invoicing/amounts.py`in yedi adımının PORTU.
  // İşaretlenmemiş kesinti `null` gider: "oran girilmedi" ile "%0" ayrıdır.
  const previewResult = computeAmountPreview({
    lines,
    advanceRate: advanceOn ? advanceRate : null,
    retentionRate: retentionOn ? retentionRate : null,
    withholdingRate: withholdingOn ? withholdingRate : null,
  });
  const preview = previewResult.ok ? previewResult.preview : null;

  function patchLine(key: string, patch: Partial<InvoiceLineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    const next = lineSeq + 1;
    setLineSeq(next);
    setLines((current) => [...current, emptyLineDraft(`l${next}`)]);
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function selectParty(value: string) {
    setPartySelection(value);
    if (value === MANUAL_PARTY) return;
    const employer = employersQuery.data?.items.find((item) => item.id === value);
    if (employer === undefined) return;
    setPartyName(employer.name);
    if (employer.tax_number !== null) setTaxNumber(employer.tax_number);
  }

  /** Gövdeyi kurar; doğrulama hatası varsa `null` döner ve metni ekrana basar. */
  function buildBody(): InvoiceCreateRequest | null {
    const name = partyName.trim();
    if (name.length === 0) {
      setFormError("Alıcı adı zorunludur.");
      return null;
    }
    if (issueDate.length === 0) {
      setFormError("Fatura tarihi zorunludur.");
      return null;
    }
    const built = buildLines(lines);
    if (!built.ok) {
      setFormError(built.message);
      return null;
    }
    // 🔴 Kapı BURADA, `buildLines`ın içinde DEĞİL: orada "tamamen boş satır
    // atlanır" semantiği korunmalı. Sunucu kalemsiz taslağı bilerek kabul
    // ediyor (kalemler sonradan PUT /invoices/{id}/lines ile gelir, taslak
    // silinebilir) ama frontend bu iki kaçış yolunun İKİSİNİ DE sunmuyor:
    // kalemsiz taslak kullanılamaz bir kayıt olur ve giden fatura numara
    // serisinden geri alınamaz bir numara tüketir.
    if (built.lines.length === 0) {
      setFormError("En az bir kalem gereklidir.");
      return null;
    }
    setFormError(null);
    return {
      // Bu ekran YALNIZ giden fatura keser (FK:52 "Yeni Fatura Kes");
      // gelen fatura sisteme zaten kesilmiş girer (K2).
      direction: "outgoing",
      document_type: documentType,
      issue_date: issueDate,
      party_name: name,
      lines: built.lines,
      ...(dueDate.length > 0 ? { due_date: dueDate } : {}),
      ...(paymentMethod.length > 0
        ? { payment_method: paymentMethod as InvoiceCreateRequest["payment_method"] }
        : {}),
      ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      ...(taxNumber.trim().length > 0 ? { party_tax_number: taxNumber.trim() } : {}),
      ...(taxOffice.trim().length > 0 ? { party_tax_office: taxOffice.trim() } : {}),
      ...(address.trim().length > 0 ? { party_address: address.trim() } : {}),
      ...(partySelection !== MANUAL_PARTY ? { employer_id: partySelection } : {}),
      ...(source === "progress_payment" && progressPaymentId.length > 0
        ? { progress_payment_id: progressPaymentId }
        : {}),
      // 🔴 Oranlar GİDER, tutarlar GİTMEZ: hesaplanmış para alanı gövdeden
      // gelirse sunucu 422 verir (şema notu).
      ...(advanceOn ? { advance_rate: Number(advanceRate) } : {}),
      ...(retentionOn ? { retention_rate: Number(retentionRate) } : {}),
      ...(withholdingOn ? { withholding_rate: Number(withholdingRate) } : {}),
    } as InvoiceCreateRequest;
  }

  function submit(alsoSend: boolean) {
    const body = buildBody();
    if (body === null) return;
    createMutation.mutate(body, {
      onError: (error) => setFormError(backendErrorMessage(error, "Fatura kaydedilemedi.")),
      onSuccess: (created) => {
        if (!alsoSend) {
          router.push(invoiceDetailUrl(created.id));
          return;
        }
        actionMutation.mutate(
          { invoiceId: created.id, action: "send" },
          {
            // Gönderim başarısız olsa bile TASLAK KAYDEDİLDİ: kullanıcı
            // detaya götürülür ve hata orada değil burada söylenir.
            onError: (error) =>
              setFormError(
                `Fatura taslak olarak kaydedildi ama gönderilemedi: ${backendErrorMessage(error)}`,
              ),
            onSuccess: () => router.push(invoiceDetailUrl(created.id)),
          },
        );
      },
    });
  }

  const canWrite = canEditInvoice;

  return (
    <div className="fat">
      <p className="fat__eyebrow">Muhasebe / Fatura Yönetimi</p>
      <div className="fat__head">
        <div>
          {/* 52-53 */}
          <h1 className="fat__title">Yeni Fatura Kes</h1>
          <p className="fat__subtitle">Hakedişten otomatik doldur veya manuel gir</p>
        </div>
        <div className="fat__actions">
          {/* 24 */}
          <Button
            disabled={!canWrite || busy}
            data-testid="fat-save-draft"
            onClick={() => submit(false)}
          >
            Taslak Kaydet
          </Button>
          {/* 25 — uç GERÇEKTİR ama yalnız DURUM damgalar (GİB'e gerçek gönderim
              yapılmaz, spec §1). Bu, düğmenin altındaki bantta söylenir. */}
          <Button
            variant="success"
            disabled={!canWrite || busy}
            data-testid="fat-save-send"
            onClick={() => submit(true)}
          >
            GİB&apos;e Gönder
          </Button>
        </div>
      </div>

      {!canWrite && (
        <p className="fat-notice fat-notice--danger">
          Fatura yönetiminde yazma yetkiniz yok; form salt-okunurdur.
        </p>
      )}
      <p className="fat-notice" data-testid="fat-send-reason">
        “GİB&apos;e Gönder” faturayı yalnız <strong>Gönderildi</strong> durumuna
        damgalar; {REASONS.gib}
      </p>
      {formError !== null && (
        <p className="fat-notice fat-notice--danger" data-testid="fat-form-error">
          {formError}
        </p>
      )}

      {/* 56-93 — Fatura Kaynağı */}
      <div className="fat-source">
        <div className="fat-source__title">Fatura Kaynağı</div>
        <div className="fat-source__cards">
          {/* 59-66 */}
          <button
            type="button"
            className="fat-source__card"
            aria-pressed={source === "progress_payment"}
            data-testid="fat-source-hakedis"
            onClick={() => setSource("progress_payment")}
          >
            <div className="fat-source__card-title">Onaylı Hakedişten</div>
            <div className="fat-source__card-hint">Faturayı hakedişe bağla</div>
          </button>
          {/* 67-74 — karşılığı YOK: SİLİNMEZ, devre dışı + gerekçe. */}
          <button
            type="button"
            className="fat-source__card"
            disabled
            title={REASONS.fromOrder}
            data-testid="fat-source-siparis"
          >
            <div className="fat-source__card-title">Siparişten</div>
            <div className="fat-source__card-hint">{REASONS.fromOrder}</div>
          </button>
          {/* 75-82 */}
          <button
            type="button"
            className="fat-source__card"
            aria-pressed={source === "manual"}
            data-testid="fat-source-manuel"
            onClick={() => setSource("manual")}
          >
            <div className="fat-source__card-title">Manuel</div>
            <div className="fat-source__card-hint">Boş fatura</div>
          </button>
        </div>

        {source === "progress_payment" && (
          <>
            {/* 85-91 */}
            <Field label="Onaylı Hakediş Seç">
              {(control) => (
                <Select
                  {...control}
                  value={progressPaymentId}
                  disabled={!canWrite}
                  data-testid="fat-progress-payment"
                  onChange={(event) => setProgressPaymentId(event.target.value)}
                >
                  <option value="">Hakediş seçin...</option>
                  {(progressPaymentsQuery.data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {progressPaymentOptionLabel(item)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="fat-notice" data-testid="fat-autofill-reason">
              {REASONS.autoFill}
            </p>
          </>
        )}
      </div>

      {/* 96-157 — Fatura Bilgileri */}
      <section className="fat-panel" aria-label="Fatura Bilgileri">
        <div className="fat-panel__head">
          <span className="fat-panel__title">Fatura Bilgileri</span>
        </div>
        <div className="fat-panel__body">
          <div className="fat-form__grid">
            <div className="fat-form__col">
              {/* 101-107 */}
              <Field label="Alıcı" required>
                {(control) => (
                  <Select
                    {...control}
                    value={partySelection}
                    disabled={!canWrite}
                    data-testid="fat-party-select"
                    onChange={(event) => selectParty(event.target.value)}
                  >
                    <option value={MANUAL_PARTY}>Elle gir…</option>
                    {(employersQuery.data?.items ?? []).map((employer) => (
                      <option key={employer.id} value={employer.id}>
                        {employer.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                label="Alıcı Adı"
                required
                hint="Listede olmayan alıcı için adı elle yazın."
              >
                {(control) => (
                  <Input
                    {...control}
                    value={partyName}
                    disabled={!canWrite}
                    data-testid="fat-party-name"
                    onChange={(event) => setPartyName(event.target.value)}
                  />
                )}
              </Field>
              {/* 110-112 */}
              <Field label="VKN / TCKN">
                {(control) => (
                  <Input
                    {...control}
                    value={taxNumber}
                    maxLength={11}
                    disabled={!canWrite}
                    data-testid="fat-tax-number"
                    onChange={(event) => setTaxNumber(event.target.value)}
                  />
                )}
              </Field>
              {/* 114-116 */}
              <Field label="Vergi Dairesi">
                {(control) => (
                  <Input
                    {...control}
                    value={taxOffice}
                    disabled={!canWrite}
                    onChange={(event) => setTaxOffice(event.target.value)}
                  />
                )}
              </Field>
              {/* 118-120 */}
              <Field label="Adres">
                {(control) => (
                  <Textarea
                    {...control}
                    rows={2}
                    value={address}
                    disabled={!canWrite}
                    onChange={(event) => setAddress(event.target.value)}
                  />
                )}
              </Field>
            </div>

            <div className="fat-form__col">
              <div className="fat-form__pair">
                {/* 125-127 */}
                <Field label="Fatura Tarihi" required>
                  {(control) => (
                    <DateInput
                      {...control}
                      value={issueDate}
                      disabled={!canWrite}
                      data-testid="fat-issue-date"
                      onValueChange={(iso) => setIssueDate(iso)}
                    />
                  )}
                </Field>
                {/* 129-131 */}
                <Field label="Vade Tarihi">
                  {(control) => (
                    <DateInput
                      {...control}
                      value={dueDate}
                      disabled={!canWrite}
                      data-testid="fat-due-date"
                      onValueChange={(iso) => setDueDate(iso)}
                    />
                  )}
                </Field>
              </div>
              {/* 134-141 */}
              <Field label="Fatura Tipi">
                {(control) => (
                  <Select
                    {...control}
                    value={documentType}
                    disabled={!canWrite}
                    data-testid="fat-document-type"
                    onChange={(event) =>
                      setDocumentType(
                        event.target.value as InvoiceCreateRequest["document_type"],
                      )
                    }
                  >
                    {DOCUMENT_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {DOCUMENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {/* 143-150 */}
              <Field label="Ödeme Şekli">
                {(control) => (
                  <Select
                    {...control}
                    value={paymentMethod}
                    disabled={!canWrite}
                    data-testid="fat-payment-method"
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    {INVOICE_PAYMENT_METHOD_OPTIONS.map((method) => (
                      <option key={method} value={method}>
                        {INVOICE_PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {/* 152-154 */}
              <Field label="Not / Açıklama">
                {(control) => (
                  <Input
                    {...control}
                    value={note}
                    placeholder="Fatura üzerinde görünecek not..."
                    disabled={!canWrite}
                    onChange={(event) => setNote(event.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
        </div>
      </section>

      <InvoiceLinesEditor
        lines={lines}
        onChange={patchLine}
        onAdd={addLine}
        onRemove={removeLine}
        disabled={!canWrite}
      />

      {/* 218-256 — Kesintiler + Fatura Özeti */}
      <div className="fat-columns">
        <section className="fat-panel" aria-label="Kesintiler">
          <div className="fat-panel__head">
            <span className="fat-panel__title">Kesintiler</span>
          </div>
          <div className="fat-panel__body">
            <div className="fat-deductions">
              {/* 222-227 */}
              <div className="fat-deduction">
                <Checkbox
                  checked={advanceOn}
                  disabled={!canWrite}
                  data-testid="fat-advance-toggle"
                  onChange={(event) => setAdvanceOn(event.target.checked)}
                />
                <span className="fat-deduction__label">Avans Kesintisi</span>
                <Input
                  size="row"
                  type="number"
                  className="fat-deduction__rate"
                  aria-label="Avans kesintisi oranı"
                  min={INVOICE_RATE_MIN}
                  max={INVOICE_RATE_MAX}
                  value={advanceRate}
                  disabled={!canWrite || !advanceOn}
                  onChange={(event) => setAdvanceRate(event.target.value)}
                />
                <span className="fat-deduction__unit">%</span>
                {/* 225 */}
                <DeductionAmount
                  testId="fat-advance-amount"
                  amount={advanceOn && preview !== null ? preview.advanceAmount : null}
                />
              </div>
              {/* 228-233 */}
              <div className="fat-deduction">
                <Checkbox
                  checked={retentionOn}
                  disabled={!canWrite}
                  data-testid="fat-retention-toggle"
                  onChange={(event) => setRetentionOn(event.target.checked)}
                />
                <span className="fat-deduction__label">Teminat Kesintisi</span>
                <Input
                  size="row"
                  type="number"
                  className="fat-deduction__rate"
                  aria-label="Teminat kesintisi oranı"
                  min={INVOICE_RATE_MIN}
                  max={INVOICE_RATE_MAX}
                  value={retentionRate}
                  disabled={!canWrite || !retentionOn}
                  onChange={(event) => setRetentionRate(event.target.value)}
                />
                <span className="fat-deduction__unit">%</span>
                {/* 231 */}
                <DeductionAmount
                  testId="fat-retention-amount"
                  amount={retentionOn && preview !== null ? preview.retentionAmount : null}
                />
              </div>
              {/* 234-239 */}
              <div className="fat-deduction">
                <Checkbox
                  checked={withholdingOn}
                  disabled={!canWrite}
                  data-testid="fat-withholding-toggle"
                  onChange={(event) => setWithholdingOn(event.target.checked)}
                />
                <span className="fat-deduction__label">KDV Tevkifatı (Yapı İşleri)</span>
                <Input
                  size="row"
                  type="number"
                  className="fat-deduction__rate"
                  aria-label="KDV tevkifatı oranı"
                  min={INVOICE_RATE_MIN}
                  max={INVOICE_RATE_MAX}
                  value={withholdingRate}
                  disabled={!canWrite || !withholdingOn}
                  onChange={(event) => setWithholdingRate(event.target.value)}
                />
                <span className="fat-deduction__unit">%</span>
                {/* 237 — mockup burada "—" basar (kutu işaretli DEĞİL). */}
                <DeductionAmount
                  testId="fat-withholding-amount"
                  amount={withholdingOn && preview !== null ? preview.withholdingAmount : null}
                />
              </div>
            </div>
            <p className="fat-notice" data-testid="fat-deduction-reason">
              Tevkifatın matrahı KDV tutarıdır (mal/hizmet toplamı değil) ve fatura toplamından
              DÜŞÜLÜR. {REASONS.previewOnly}
            </p>
          </div>
        </section>

        <section className="fat-panel" aria-label="Fatura Özeti">
          <div className="fat-panel__head">
            <span className="fat-panel__title">Fatura Özeti</span>
          </div>
          <div className="fat-panel__body">
            {/* 246 */}
            <div className="fat-summary-row">
              <span className="fat-summary-row__label">Mal/Hizmet Toplamı</span>
              <span className="fat-summary-row__value" data-testid="fat-subtotal-preview">
                {preview === null ? UNKNOWN : formatAmount(preview.subtotal)}
              </span>
            </div>
            {/* 247 — avans + teminat (tevkifat DEĞİL: onun matrahı KDV'dir). */}
            <div className="fat-summary-row">
              <span className="fat-summary-row__label">Kesintiler</span>
              <span
                className="fat-summary-row__value fat-summary-row__value--danger"
                data-testid="fat-deduction-total"
              >
                {preview === null ? UNKNOWN : `– ${formatAmount(preview.deductionTotal)}`}
              </span>
            </div>
            {/* 248 */}
            <div className="fat-summary-row">
              <span className="fat-summary-row__label">Vergi Matrahı</span>
              <span className="fat-summary-row__value" data-testid="fat-tax-base">
                {preview === null ? UNKNOWN : formatAmount(preview.taxBase)}
              </span>
            </div>
            {/* 249 — mockup TEK oran yazar ("KDV (%20)"); fatura çok oranlı
                olabildiği için başlık gerçek oranlardan kurulur. */}
            <div className="fat-summary-row">
              <span className="fat-summary-row__label">
                {preview === null ? "KDV" : vatLabel(preview.vatRates)}
              </span>
              <span
                className="fat-summary-row__value fat-summary-row__value--success"
                data-testid="fat-vat-amount"
              >
                {preview === null ? UNKNOWN : `+ ${formatAmount(preview.vatAmount)}`}
              </span>
            </div>
            {/* 250 */}
            <div className="fat-summary-row fat-summary-row--total">
              <span className="fat-summary-row__label">Fatura Toplamı</span>
              <span className="fat-summary-row__value" data-testid="fat-total">
                {preview === null ? UNKNOWN : `₺${formatAmount(preview.total)}`}
              </span>
            </div>
            {!previewResult.ok && (
              <p className="fat-notice fat-notice--danger" data-testid="fat-preview-blocked">
                Önizleme hesaplanamadı: {previewResult.reason}
              </p>
            )}
            {previewResult.ok && previewResult.unknownCount > 0 && (
              <p className="fat-notice" data-testid="fat-subtotal-unknown">
                {previewResult.unknownCount} kalemin tutarı çözülemedi (miktar/birim fiyat eksik) —
                yukarıdaki tutarlar EKSİKTİR.
              </p>
            )}
            <p className="fat-notice" data-testid="fat-totals-reason">
              {REASONS.previewOnly} {REASONS.accounting}
            </p>
          </div>
        </section>
      </div>

      <p className="fat-notice">
        <a href={INVOICES_URL}>&larr; Fatura listesine dön</a>
      </p>

      {employersQuery.data !== undefined && <span hidden data-testid="fat-loaded-employers" />}
      {progressPaymentsQuery.data !== undefined && (
        <span hidden data-testid="fat-loaded-progress-payments" />
      )}
    </div>
  );
}
