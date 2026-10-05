"use client";

import { useState } from "react";

import { DeleteRecordDialog } from "@/components/delete-confirm/DeleteRecordDialog";
import { Button, DateInput, Field, Input, Select } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { isoDate } from "@/components/site-diary/derive";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  BANK_ACCOUNT_LIST_MAX_LIMIT,
  useBankAccounts,
} from "@/lib/api/hooks/useBankAccounts";
import { useInvoicePayments } from "@/lib/api/hooks/useInvoiceDetail";
import { useCreateInvoicePayment } from "@/lib/api/hooks/useInvoiceMutations";
import { TREASURY_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount, formatDateDots } from "@/lib/format";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { PAYMENT_KIND_LABELS, PAYMENT_KIND_OPTIONS } from "./invoice-labels";

/**
 * FGI:219-249 "Tahsilat Kaydı" — GERÇEK uç (`POST /invoices/{id}/payments`).
 *
 * ⚠️ İKİ BAĞIMSIZ KAYNAK: ödeme satırları (`/invoices/{id}/payments`) ve banka
 * hesapları (`/bank-accounts`, FGI:241-244 "Hesap" seçicisi).
 *
 * 🔴 `paid_total`/`remaining` TÜM satırlardan gelir, sayfadan DEĞİL — kırpılma
 * onları bozmaz; kırpılma yalnız listeyi etkiler ve GÖRÜNÜR kılınır.
 * 🔴 K6 kapısı (Σ + yeni > total → 422) İSTEMCİDE KOPYALANMAZ: sunucu kuruş
 * bazında karşılaştırır, ekran onun metnini basar.
 * 🔴 Silme YALNIZ `admin`dir (`canDelete`); `full` seviyesi 403 alır.
 */
export function InvoicePaymentsPanel({
  invoiceId,
  isIncoming,
  canWrite,
  canDelete,
}: {
  invoiceId: string;
  isIncoming: boolean;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const paymentsQuery = useInvoicePayments(invoiceId);
  const accountsQuery = useBankAccounts({
    isActive: true,
    limit: BANK_ACCOUNT_LIST_MAX_LIMIT,
  });
  const createPayment = useCreateInvoicePayment(invoiceId);
  // SIL-F2.2 · silme ortak onay penceresinden (önizleme + token) geçer; açık satırın kimliği.
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  const [today] = useState(() => new Date());
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("transfer");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(() => isoDate(today));
  const [error, setError] = useState<string | null>(null);
  const isAmountHidden = useCategoryHidden(TREASURY_HIDDEN_CATEGORIES);
  // SEKME-F1.3b · yalnız `amount` `onSuccess`te sıfırlanır (bilinen kısmi
  // reset borcu, envanter notu) — diğer alanlar (hesap/şekil/tarih) KALIR.
  // Baseline bu davranışı AYNEN izler: kaydetme başarılı olunca yalnız
  // `amount` tabanı "" olur, diğerleri o anki değerlere hizalanır — görünür
  // davranış DEĞİŞMEZ, yalnız "kaydedilmiş" alanlar sahte-kirli göstermez.
  const [baseline, setBaseline] = useState({ accountId: "", method: "transfer", paidOn: isoDate(today) });
  const isDirty =
    accountId !== baseline.accountId ||
    method !== baseline.method ||
    amount !== "" ||
    paidOn !== baseline.paidOn;
  useUnsavedChanges(isDirty, "Tahsilat");

  const rows = paymentsQuery.data?.items;
  const truncation = buildListTruncation(rows?.length ?? 0, paymentsQuery.data?.total);
  const title = isIncoming ? "Ödeme Kaydı" : "Tahsilat Kaydı";

  function submit() {
    if (accountId.length === 0) {
      setError("Hesap seçilmelidir.");
      return;
    }
    const numeric = Number(amount.replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Tutar sıfırdan büyük olmalıdır.");
      return;
    }
    setError(null);
    createPayment.mutate(
      {
        bank_account_id: accountId,
        method: method as (typeof PAYMENT_KIND_OPTIONS)[number],
        amount: numeric,
        paid_on: paidOn,
      },
      {
        onError: (err) => setError(backendErrorMessage(err, "Tahsilat kaydedilemedi.")),
        onSuccess: () => {
          setAmount("");
          setBaseline({ accountId, method, paidOn });
        },
      },
    );
  }

  return (
    <section className="fat-panel" aria-label={title}>
      <div className="fat-panel__head">
        <span className="fat-panel__title">{title}</span>
      </div>
      <div className="fat-panel__body">
        {/* K5 — iki türev toplam SUNUCUDAN, istemcide toplanmaz. */}
        <div className="fat-summary-row">
          <span className="fat-summary-row__label">Tahsil Edilen</span>
          <span className="fat-summary-row__value" data-testid="fat-paid-total">
            {paymentsQuery.data ? formatAmount(paymentsQuery.data.paid_total) : "—"}
            <MaskedMark isHidden={isAmountHidden} values={[paymentsQuery.data?.paid_total]} />
          </span>
        </div>
        <div className="fat-summary-row">
          <span className="fat-summary-row__label">Kalan</span>
          <span className="fat-summary-row__value" data-testid="fat-remaining">
            {paymentsQuery.data ? formatAmount(paymentsQuery.data.remaining) : "—"}
            <MaskedMark isHidden={isAmountHidden} values={[paymentsQuery.data?.remaining]} />
          </span>
        </div>

        {paymentsQuery.isError && (
          <p className="fat-notice fat-notice--danger" data-testid="fat-payments-error">
            {backendErrorMessage(paymentsQuery.error, "Tahsilat listesi yüklenemedi.")}
          </p>
        )}
        {truncation.isTruncated && (
          <p className="fat-notice" data-testid="fat-payments-truncation">
            {listTruncationMessage(truncation)}
          </p>
        )}

        {rows !== undefined && rows.length > 0 && (
          <div className="fat-table-scroll">
            <table className="fat-table" data-testid="fat-payments-table">
              <thead>
                <tr>
                  <th scope="col">Tarih</th>
                  <th scope="col">Şekil</th>
                  <th scope="col" className="is-right">
                    Tutar
                    <MaskedMark isHidden={isAmountHidden} values={(rows ?? []).map((row) => row.amount)} />
                  </th>
                  <th scope="col">
                    <span className="sr-only">Sil</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((payment) => (
                  <tr key={payment.id} data-testid="fat-payment-row">
                    <td>{formatDateDots(payment.paid_on)}</td>
                    <td>{PAYMENT_KIND_LABELS[payment.method]}</td>
                    <td className="is-right is-mono">{formatAmount(payment.amount)}</td>
                    <td className="is-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canDelete}
                        title={
                          canDelete
                            ? undefined
                            : "Ödeme silme yalnız yönetici (admin) yetkisindedir."
                        }
                        data-testid="fat-payment-delete"
                        onClick={() => setDeletingPaymentId(payment.id)}
                      >
                        Sil
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {deletingPaymentId !== null && (
          <DeleteRecordDialog
            kind="payment"
            recordId={deletingPaymentId}
            onClose={() => setDeletingPaymentId(null)}
          />
        )}

        {error !== null && (
          <p className="fat-notice fat-notice--danger" data-testid="fat-payment-error">
            {error}
          </p>
        )}

        <div className="fat-form__col">
          {/* 223-229 */}
          <Field label={isIncoming ? "Ödeme Şekli" : "Tahsilat Şekli"}>
            {(control) => (
              <Select
                {...control}
                value={method}
                disabled={!canWrite}
                data-testid="fat-payment-method-kind"
                onChange={(event) => setMethod(event.target.value)}
              >
                {PAYMENT_KIND_OPTIONS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PAYMENT_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {/* 232-234 */}
          <Field label={isIncoming ? "Ödenen Tutar" : "Tahsil Edilen Tutar"}>
            {(control) => (
              <Input
                {...control}
                type="number"
                step="any"
                placeholder="0"
                value={amount}
                disabled={!canWrite}
                data-testid="fat-payment-amount"
                onChange={(event) => setAmount(event.target.value)}
              />
            )}
          </Field>
          {/* 236-238 */}
          <Field label={isIncoming ? "Ödeme Tarihi" : "Tahsilat Tarihi"}>
            {(control) => (
              <DateInput
                {...control}
                value={paidOn}
                disabled={!canWrite}
                data-testid="fat-payment-date"
                onValueChange={(iso) => setPaidOn(iso)}
              />
            )}
          </Field>
          {/* 240-245 */}
          <Field label="Hesap" required>
            {(control) => (
              <Select
                {...control}
                value={accountId}
                disabled={!canWrite}
                data-testid="fat-payment-account"
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">Hesap seçin...</option>
                {(accountsQuery.data?.items ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.bank_name} · {account.display_name ?? account.iban ?? account.id}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {/* 246 */}
          <Button
            variant="success"
            disabled={!canWrite || createPayment.isPending}
            data-testid="fat-payment-submit"
            onClick={submit}
          >
            {isIncoming ? "Ödemeyi Kaydet" : "Tahsilatı Kaydet"}
          </Button>
          {/* 247 — otomatik yevmiye/Hazine işlemesi YOKTUR. */}
          <p className="fat-notice">
            Kaydedilen tahsilat faturanın durumunu sunucuda yeniden türetir; yevmiye
            defterine otomatik işleme bu dilimde yapılmaz.
          </p>
        </div>

        {paymentsQuery.data !== undefined && <span hidden data-testid="fat-loaded-payments" />}
        {accountsQuery.data !== undefined && <span hidden data-testid="fat-loaded-accounts" />}
      </div>
    </section>
  );
}
