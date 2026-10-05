"use client";

import { useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { Alert, Badge, Button } from "@/components/ui";
import { classifyDeleteError, type DeleteFailure } from "@/lib/api/delete-error";
import { useAdminDelete, useDeletePreview, type DeleteKind, type DeletePreview } from "@/lib/api/hooks/useAdminDelete";
import { cx } from "@/lib/cx";
import { formatDateDots, formatMoneyTl, PERIOD_MONTHS } from "@/lib/format";
import { DELETE_KIND_FALLBACK_LABELS, formatSamples, journalStatusText } from "./delete-labels";
import "./delete-confirm.css";

export interface DeletedRecord {
  kindLabel: string;
  label: string;
}

export interface DeleteConfirmDialogProps {
  kind: DeleteKind;
  recordId: string;
  onClose: () => void;
  /** Silme BAŞARIYLA bitti — çağıran yönlendirir ve bildirim gösterir. */
  onDeleted: (deleted: DeletedRecord) => void;
}

function summaryText(preview: DeletePreview): string {
  return preview.dependent_count > 0
    ? `${preview.label} ve bağlı ${preview.dependent_count} kayıt silinecek.`
    : `${preview.label} silinecek; bağlı kayıt yok.`;
}

function GroupsTable({ preview }: { preview: DeletePreview }) {
  if (preview.groups.length === 0) return null;
  return (
    <table className="delete-confirm__table" data-testid="delete-groups">
      <thead>
        <tr>
          <th scope="col">Kayıt türü</th>
          <th scope="col" className="delete-confirm__num">
            Adet
          </th>
          <th scope="col">Örnekler</th>
        </tr>
      </thead>
      <tbody>
        {preview.groups.map((group) => (
          <tr
            key={group.table}
            className={cx(group.is_financial && "delete-confirm__row--financial")}
            data-financial={group.is_financial ? "true" : undefined}
          >
            <td>
              {group.label}
              {group.is_financial && (
                <Badge variant="danger" className="delete-confirm__badge">
                  mali kayıt
                </Badge>
              )}
            </td>
            <td className="delete-confirm__num">{group.count}</td>
            <td className="delete-confirm__samples">{formatSamples(group.samples, group.count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DetachedSection({ preview }: { preview: DeletePreview }) {
  if (preview.detached.length === 0) return null;
  return (
    <section className="delete-confirm__detached" data-testid="delete-detached">
      <h3 className="delete-confirm__subtitle">Silinmeyecek, yalnız bağı kopacak</h3>
      <ul className="delete-confirm__detached-list">
        {preview.detached.map((group) => (
          <li key={group.table}>
            {group.label} · {group.count}
            {group.is_financial && (
              <Badge variant="danger" className="delete-confirm__badge">
                mali kayıt
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** SIL-F2.2 · Silinecek muhasebe fişleri — varsayılan KAPALI katlanır liste. */
function JournalEntriesSection({ preview }: { preview: DeletePreview }) {
  if (preview.journal_entry_count === 0) return null;
  return (
    <details className="delete-confirm__entries" data-testid="delete-journal-entries">
      <summary className="delete-confirm__entries-summary">
        Silinecek muhasebe fişleri ({preview.journal_entry_count})
      </summary>
      {preview.closed_period_entry_count > 0 && (
        <p className="delete-confirm__entries-warning" data-testid="delete-closed-period-warning">
          {preview.closed_period_entry_count} fiş kapalı döneme ait.
        </p>
      )}
      <table className="delete-confirm__table">
        <thead>
          <tr>
            <th scope="col">Fiş no</th>
            <th scope="col">Tarih</th>
            <th scope="col">Durum</th>
            <th scope="col" className="delete-confirm__num">
              Tutar
            </th>
          </tr>
        </thead>
        <tbody>
          {preview.journal_entries.map((entry) => (
            <tr key={entry.entry_no} data-testid="delete-journal-entry-row">
              <td>
                {entry.entry_no}
                {entry.is_reversal && (
                  <Badge variant="warning" className="delete-confirm__badge">
                    ters kayıt
                  </Badge>
                )}
                {entry.period_closed && (
                  <Badge variant="warning" className="delete-confirm__badge">
                    kapalı dönem
                  </Badge>
                )}
              </td>
              <td>{formatDateDots(entry.entry_date)}</td>
              <td>{journalStatusText(entry.status)}</td>
              <td className="delete-confirm__num">{formatMoneyTl(entry.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** SIL-F2.2 · Silinince kaynak belgesi fişsiz kalacak kayıtlar. */
function DocumentsWithoutEntrySection({ preview }: { preview: DeletePreview }) {
  if (preview.documents_left_without_entry.length === 0) return null;
  return (
    <Alert variant="warning" title="Kaynak belge fişsiz kalacak" data-testid="delete-documents-without-entry">
      <ul className="delete-confirm__plain-list">
        {preview.documents_left_without_entry.map((doc) => (
          <li key={`${doc.table}:${doc.ref}`}>
            {doc.label} · {doc.ref} — {doc.message}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function periodText(period: { month: number; year: number; status: string }): string {
  const month = PERIOD_MONTHS.find((m) => m.value === period.month)?.label ?? String(period.month);
  return `${month} ${period.year} · ${period.status}`;
}

/** SIL-F2.2 · Kapanmış bordro dönemi uyarısı — sunucu mesajı AYNEN basılır. */
function ClosedPayrollSection({ preview }: { preview: DeletePreview }) {
  if (!preview.closed_payroll_message) return null;
  return (
    <Alert variant="warning" data-testid="delete-closed-payroll">
      <p className="delete-confirm__alert-text">{preview.closed_payroll_message}</p>
      {preview.closed_payroll_periods.length > 0 && (
        <ul className="delete-confirm__plain-list">
          {preview.closed_payroll_periods.map((period) => (
            <li key={`${period.year}-${period.month}`}>{periodText(period)}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

/**
 * SIL-F1.2 · Ortak silme onay penceresi (şantiye/bölüm/blok/ünite; SIL-F2.2: + 6 mali aile).
 *
 * Mockup'ı YOKTUR (onaylı sapma): ortak `Modal` + `Button`/`Badge`/`Alert`
 * ilkelleri; yeni tasarım dili yok. Silinecek ağaç SUNUCUDAKİ önizlemeden
 * gelir ve `preview_token` DELETE'e aynen verilir. Ağaç arada değişirse
 * (409 `preview_stale`) önizleme yeniden çekilir, pencere yeni ağaçla açık
 * kalır. SIL-F2.2: mali aileler fiş listesi, fişsiz kalacak belge ve kapanmış
 * bordro uyarılarını da taşır; SIL-B2'de `financial_pending` kalktı (mali
 * kayıt artık silmeyi KİLİTLEMEZ, yalnız rozetle işaretlenir).
 */
export function DeleteConfirmDialog({ kind, recordId, onClose, onDeleted }: DeleteConfirmDialogProps) {
  const preview = useDeletePreview(kind, recordId);
  const remove = useAdminDelete();
  const [failure, setFailure] = useState<DeleteFailure | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);

  const data = preview.data;
  const previewFailure = preview.isError ? classifyDeleteError(preview.error) : null;
  const isBusy = remove.isPending;
  const canConfirm = data !== undefined && !preview.isFetching && !isBusy;
  const kindLabel = data?.kind_label ?? DELETE_KIND_FALLBACK_LABELS[kind];

  function handleClose() {
    if (!isBusy) onClose();
  }

  function handleConfirm() {
    if (!data) return;
    setFailure(null);
    setStaleNotice(null);
    remove.mutate(
      { kind, id: recordId, previewToken: data.preview_token },
      {
        onSuccess: () => onDeleted({ kindLabel: data.kind_label, label: data.label }),
        onError: (err) => {
          const classified = classifyDeleteError(err);
          if (classified.reason === "preview_stale" || classified.reason === "preview_required") {
            // Ağaç değişti: eski token artık GEÇERSİZ — yeni ağaç çekilene dek Sil kapalı (isFetching).
            setStaleNotice(classified.message);
            void preview.refetch();
            return;
          }
          setFailure(classified);
        },
      },
    );
  }

  return (
    <Modal
      title={`${kindLabel} silinsin mi?`}
      onClose={handleClose}
      className="delete-confirm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isBusy}>
            Vazgeç
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={!canConfirm}>
            Sil
          </Button>
        </>
      }
    >
      {preview.isLoading && (
        <p className="delete-confirm__state" role="status">
          Bağlı kayıtlar hesaplanıyor…
        </p>
      )}
      {previewFailure && (
        <Alert variant="danger" data-testid="delete-preview-error">
          {previewFailure.reason === "forbidden" || previewFailure.reason === "not_found"
            ? previewFailure.message
            : "Bağlı kayıtlar yüklenemedi. Pencereyi kapatıp tekrar deneyin."}
        </Alert>
      )}
      {staleNotice && (
        <Alert variant="warning" data-testid="delete-stale-notice">
          {staleNotice}
        </Alert>
      )}
      {failure && (
        <Alert variant="danger" data-testid="delete-failure">
          {failure.message}
        </Alert>
      )}
      {data && (
        <>
          <p className="delete-confirm__summary">{summaryText(data)}</p>
          <ClosedPayrollSection preview={data} />
          <DocumentsWithoutEntrySection preview={data} />
          <GroupsTable preview={data} />
          <JournalEntriesSection preview={data} />
          <DetachedSection preview={data} />
          <p className="delete-confirm__warning">Bu işlem geri alınamaz.</p>
        </>
      )}
    </Modal>
  );
}
