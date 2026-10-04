"use client";

import { useState } from "react";
import Link from "next/link";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Badge, Button } from "@/components/ui";
import { remainingDays } from "@/components/section-detail/remainingDays";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useCompany } from "@/lib/api/hooks/useCompany";
import {
  useInvoiceDetail,
  useInvoiceRentalMatch,
} from "@/lib/api/hooks/useInvoiceDetail";
import { useInvoiceAction } from "@/lib/api/hooks/useInvoiceMutations";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { INVOICE_APPROVE, INVOICING_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { formatCurrencyTight, formatDateDots } from "@/lib/format";

import { InvoiceLinesTable } from "./InvoiceLinesTable";
import { InvoicePaymentsPanel } from "./InvoicePaymentsPanel";
import { InvoiceSourceChip } from "./InvoiceSourceChip";
import { RentalMatchCard } from "./RentalMatchCard";
import {
  DOCUMENT_TYPE_LABELS,
  INVOICE_PAYMENT_METHOD_LABELS,
  INVOICE_PERMISSION_MODULE,
  INVOICES_URL,
  invoiceStatusLabel,
  invoiceStatusVariant,
  REASONS,
} from "./invoice-labels";
import "./invoices.css";

/** FGI:77-98 / FGE:86-99 taraf künyesi — adres çok satırlıdır (`white-space: pre-line`). */
function PartyBlock({
  label,
  name,
  taxNumber,
  taxOffice,
  address,
  testId,
}: {
  label: string;
  name: string;
  taxNumber: string | null;
  taxOffice: string | null;
  address: string | null;
  testId: string;
}) {
  const identity = [
    taxNumber !== null ? `VKN: ${taxNumber}` : null,
    taxOffice,
  ].filter((part): part is string => part !== null && part.length > 0);
  return (
    <div data-testid={testId}>
      <div className="fat-party__label">{label}</div>
      <div className="fat-party__name">{name}</div>
      <div className="fat-party__meta">
        {identity.length > 0 ? identity.join(" · ") : "Vergi künyesi girilmemiş"}
        {address !== null && address.length > 0 ? `\n${address}` : ""}
      </div>
    </div>
  );
}

/**
 * FGI/FGE · `/faturalar/[invoiceId]` — TEK rota, `direction` ile dallanır.
 *
 * İki mockup arasındaki ölçülen farklar (ve nedenleri):
 *   · üst aksiyonlar: FGI:24-26 PDF/XML/Tahsilat · FGE:24-25 İtiraz/Onayla
 *   · rozet: FGI:58 "GİDEN FATURA" · FGE:68 "GELEN FATURA"
 *   · taraf sırası: FGI'de "Satıcı (Biz)" solda, FGE'de "Satıcı" (karşı taraf)
 *   · FGE'de eşleştirme kartı + fark bandı VAR, FGI'de yok
 *   · FGI'de dört alanlı künye şeridi (93-98) + GİB geçmişi + tahsilat formu
 * Yapının GERİ KALANI (üst kart, kalem tablosu, tfoot toplamları) AYNIdır —
 * bu yüzden iki rota değil bir rota yazıldı; ikiye bölmek aynı kalem tablosunun
 * iki kopyasını doğururdu.
 *
 * ⚠️ VERİ KAYNAKLARI: fatura detayı · şirket künyesi · ödeme satırları · banka
 * hesapları (son ikisi `InvoicePaymentsPanel` içinde) + gelen makine kira
 * faturasında KOŞULLU beşinci kaynak (eşleştirme).
 */
export function InvoiceDetailView({ invoiceId }: { invoiceId: string }) {
  const permission = useModulePermission(INVOICE_PERMISSION_MODULE);
  const canEditInvoice = useButtonGate({ pages: INVOICING_EDIT, need: "edit", fallback: permission.canWrite });
  const canApproveInvoice = useButtonGate({ pages: INVOICE_APPROVE, need: "approve", fallback: permission.canWrite });
  const canDeletePayment = useButtonGate({ pages: INVOICING_EDIT, need: "sa", fallback: permission.canDelete });
  const detailQuery = useInvoiceDetail(invoiceId);
  const companyQuery = useCompany();
  const actionMutation = useInvoiceAction();
  const [actionError, setActionError] = useState<string | null>(null);
  const [today] = useState(() => new Date());

  const invoice = detailQuery.data;
  const rentalQuery = useInvoiceRentalMatch(invoice?.equipment_rental_invoice_id ?? null);

  if (!permission.canView || isForbidden(detailQuery.error)) return <AccessDenied />;

  if (detailQuery.isLoading) return <p className="fat-notice">Yükleniyor…</p>;
  if (detailQuery.isError) {
    return (
      <p className="fat-notice fat-notice--danger" data-testid="fat-detail-error">
        {backendErrorMessage(detailQuery.error, "Fatura yüklenemedi.")}
      </p>
    );
  }
  if (invoice === undefined) return null;

  const isIncoming = invoice.direction === "incoming";
  const company = companyQuery.data;
  const daysLeft = remainingDays(invoice.due_date, today);

  function runAction(action: "send" | "approve" | "dispute" | "mark-collected") {
    setActionError(null);
    actionMutation.mutate(
      { invoiceId, action },
      { onError: (error) => setActionError(backendErrorMessage(error, "İşlem yapılamadı.")) },
    );
  }

  const busy = actionMutation.isPending;
  // IZN-F2.x · İtiraz/GİB'e Gönder/ödeme = mali.fatura Düzenler; Onayla + Tahsil Edildi = mali.fatura Onaylar;
  // tahsilat silme = yalnız sistem yöneticisi (üstteki kapılar). Grant yoksa bugünkü modül kararı.
  const canWrite = canEditInvoice;

  return (
    <div className="fat">
      <p className="fat__eyebrow">
        <Link href={INVOICES_URL}>Fatura Yönetimi</Link> / {invoice.invoice_no}
      </p>

      <div className="fat__head">
        <div />
        <div className="fat__actions">
          {isIncoming ? (
            <>
              {/* FGE:24-25 */}
              <Button
                variant="danger"
                disabled={!canWrite || busy || invoice.status !== "pending"}
                data-testid="fat-action-dispute"
                onClick={() => runAction("dispute")}
              >
                İtiraz Et
              </Button>
              <Button
                variant="success"
                disabled={!canApproveInvoice || busy || invoice.status !== "pending"}
                data-testid="fat-action-approve"
                onClick={() => runAction("approve")}
              >
                Onayla
              </Button>
            </>
          ) : (
            <>
              {/* FGI:24-25 — karşılığı YOK, silinmez. */}
              <Button disabled title={REASONS.export} data-testid="fat-action-pdf">
                PDF İndir<span className="sr-only"> — {REASONS.export}</span>
              </Button>
              <Button disabled title={REASONS.export} data-testid="fat-action-xml">
                XML<span className="sr-only"> — {REASONS.export}</span>
              </Button>
              {/* FK:25'in detaydaki karşılığı: taslak fatura buradan gönderilir. */}
              <Button
                disabled={!canWrite || busy || invoice.status !== "draft"}
                data-testid="fat-action-send"
                onClick={() => runAction("send")}
              >
                GİB&apos;e Gönder
              </Button>
              {/* FY:130 — `sent → collected` damgası. */}
              <Button
                variant="primary"
                disabled={!canApproveInvoice || busy || invoice.status !== "sent"}
                data-testid="fat-action-collected"
                onClick={() => runAction("mark-collected")}
              >
                Tahsil Edildi İşaretle
              </Button>
            </>
          )}
        </div>
      </div>

      {actionError !== null && (
        <p className="fat-notice fat-notice--danger" data-testid="fat-action-error">
          {actionError}
        </p>
      )}
      {isIncoming && (
        <p className="fat-notice" data-testid="fat-approve-reason">
          “Onayla” faturayı yalnız <strong>Onaylandı</strong> durumuna damgalar:{" "}
          {REASONS.accounting}
        </p>
      )}

      {/* FGI:54-99 / FGE:64-102 — üst kart */}
      <section className="fat-hero" data-testid="fat-hero">
        <div className="fat-hero__top">
          <div>
            <div className="fat-hero__badges">
              <Badge variant={isIncoming ? "danger" : "primary"} data-testid="fat-direction-badge">
                {isIncoming ? "GELEN FATURA" : "GİDEN FATURA"}
              </Badge>
              {/* FGI:59 / FGE:69 — GİB rozeti: karşılığı YOK, solgun basılır. */}
              <span className="fat-disabled-surface" title={REASONS.gib}>
                <Badge variant="neutral">
                  GİB<span className="sr-only"> — {REASONS.gib}</span>
                </Badge>
              </span>
              <Badge
                variant={invoiceStatusVariant(invoice.status, invoice.due_date)}
                data-testid="fat-status-badge"
              >
                {invoiceStatusLabel(invoice.status, invoice.due_date)}
              </Badge>
            </div>
            <h1 className="fat-hero__no">{invoice.invoice_no}</h1>
            <div className="fat-hero__sub" title={REASONS.gibIdentifiers}>
              {DOCUMENT_TYPE_LABELS[invoice.document_type]}
              <span className="sr-only"> — {REASONS.gibIdentifiers}</span>
            </div>
          </div>
          <div className="fat-hero__amount-box">
            <div className="fat-hero__amount-label">Fatura Toplamı</div>
            <div
              className={`fat-hero__amount${isIncoming ? " fat-hero__amount--incoming" : ""}`}
              data-testid="fat-hero-total"
            >
              {formatCurrencyTight(invoice.total)}
            </div>
            {/* FGI:68 "Vade: 18.08.2026 (24 gün)" — gün farkı YEREL takvimden. */}
            <div className="fat-hero__due" data-testid="fat-hero-due">
              {invoice.due_date === null
                ? "Vade tarihi girilmemiş"
                : `Vade: ${formatDateDots(invoice.due_date)}${
                    daysLeft === null
                      ? ""
                      : daysLeft >= 0
                        ? ` (${daysLeft} gün)`
                        : ` (${Math.abs(daysLeft)} gün gecikti)`
                  }`}
            </div>
          </div>
        </div>

        <div className="fat-hero__parties">
          {isIncoming ? (
            <>
              <PartyBlock
                testId="fat-party-seller"
                label="Satıcı"
                name={invoice.party_name}
                taxNumber={invoice.party_tax_number}
                taxOffice={invoice.party_tax_office}
                address={invoice.party_address}
              />
              <PartyBlock
                testId="fat-party-buyer"
                label="Alıcı (Biz)"
                name={company?.name ?? "Şirket künyesi yükleniyor…"}
                taxNumber={company?.tax_number ?? null}
                taxOffice={company?.tax_office ?? null}
                address={company?.address ?? null}
              />
            </>
          ) : (
            <>
              <PartyBlock
                testId="fat-party-seller"
                label="Satıcı (Biz)"
                name={company?.name ?? "Şirket künyesi yükleniyor…"}
                taxNumber={company?.tax_number ?? null}
                taxOffice={company?.tax_office ?? null}
                address={company?.address ?? null}
              />
              <PartyBlock
                testId="fat-party-buyer"
                label="Alıcı"
                name={invoice.party_name}
                taxNumber={invoice.party_tax_number}
                taxOffice={invoice.party_tax_office}
                address={invoice.party_address}
              />
            </>
          )}
        </div>

        {/* FGI:93-98 — dört alanlı künye şeridi (yalnız giden mockup'ta çizili). */}
        {!isIncoming && (
          <div className="fat-hero__meta" data-testid="fat-hero-meta">
            <div>
              <div className="fat-meta__label">Fatura Tarihi</div>
              <div className="fat-meta__value">{formatDateDots(invoice.issue_date)}</div>
            </div>
            <div>
              <div className="fat-meta__label">Fatura Tipi</div>
              <div className="fat-meta__value">
                {DOCUMENT_TYPE_LABELS[invoice.document_type]}
              </div>
            </div>
            <div>
              <div className="fat-meta__label">Ödeme Şekli</div>
              <div className="fat-meta__value">
                {invoice.payment_method === null
                  ? "Belirtilmemiş"
                  : INVOICE_PAYMENT_METHOD_LABELS[invoice.payment_method]}
              </div>
            </div>
            <div>
              <div className="fat-meta__label">Para Birimi</div>
              <div className="fat-meta__value" title={REASONS.currency}>
                TRY<span className="sr-only"> — {REASONS.currency}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* FGI:102-109 — kaynak bandı */}
      <p className="fat-notice fat-notice--info" data-testid="fat-source-band">
        Kaynak: <InvoiceSourceChip fields={invoice} testId="fat-source-chip" />
      </p>

      {/* FGE:104-143 — YALNIZ makine kira faturasına bağlı gelen faturada. */}
      {invoice.equipment_rental_invoice_id !== null && (
        <RentalMatchCard
          rental={rentalQuery.data}
          isLoading={rentalQuery.isLoading}
          errorMessage={
            rentalQuery.isError
              ? backendErrorMessage(rentalQuery.error, "Eşleştirme kontrolü yüklenemedi.")
              : undefined
          }
        />
      )}

      <InvoiceLinesTable invoice={invoice} />

      <div className="fat-columns">
        {/* FGI:193-217 — GİB işlem geçmişi: karşılığı YOK, panel SİLİNMEZ. */}
        <section
          className="fat-panel fat-disabled-surface"
          aria-label="GİB İşlem Geçmişi"
          data-testid="fat-gib-timeline"
        >
          <div className="fat-panel__head">
            <span className="fat-panel__title">GİB İşlem Geçmişi</span>
          </div>
          <div className="fat-panel__body">
            <p className="fat-notice">{REASONS.gibTimeline}</p>
            <p className="fat-notice">{REASONS.gibIdentifiers}</p>
          </div>
        </section>

        <InvoicePaymentsPanel
          invoiceId={invoiceId}
          isIncoming={isIncoming}
          canWrite={canWrite}
          canDelete={canDeletePayment}
        />
      </div>

      {/* FGE:197-241 — Muhasebe Kaydı Önizleme: karşılığı YOK, SİLİNMEZ. */}
      <section
        className="fat-panel fat-disabled-surface"
        aria-label="Muhasebe Kaydı Önizleme"
        data-testid="fat-accounting-preview"
      >
        <div className="fat-panel__head">
          <span className="fat-panel__title">Muhasebe Kaydı Önizleme</span>
        </div>
        <div className="fat-panel__body">
          <p className="fat-notice">{REASONS.accounting}</p>
        </div>
      </section>

      {detailQuery.data !== undefined && <span hidden data-testid="fat-loaded-detail" />}
      {companyQuery.data !== undefined && <span hidden data-testid="fat-loaded-company" />}
      {rentalQuery.data !== undefined && <span hidden data-testid="fat-loaded-rental" />}
    </div>
  );
}
