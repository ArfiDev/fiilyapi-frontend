"use client";

import { useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { Alert, Badge, Button } from "@/components/ui";
import { classifyDeleteError, type DeleteFailure } from "@/lib/api/delete-error";
import { useAdminDelete, useDeletePreview, type DeleteKind, type DeletePreview } from "@/lib/api/hooks/useAdminDelete";
import { cx } from "@/lib/cx";
import { DELETE_KIND_FALLBACK_LABELS, formatSamples } from "./delete-labels";
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
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * SIL-F1.2 · Ortak silme onay penceresi (şantiye/bölüm/blok/ünite).
 *
 * Mockup'ı YOKTUR (onaylı sapma): ortak `Modal` + `Button`/`Badge`/`Alert`
 * ilkelleri; yeni tasarım dili yok. Silinecek ağaç SUNUCUDAKİ önizlemeden
 * gelir ve `preview_token` DELETE'e aynen verilir. Ağaç arada değişirse
 * (409 `preview_stale`) önizleme yeniden çekilir, pencere yeni ağaçla açık
 * kalır. 409 `financial_pending` silmeyi KİLİTLER (düğme kapalı).
 */
export function DeleteConfirmDialog({ kind, recordId, onClose, onDeleted }: DeleteConfirmDialogProps) {
  const preview = useDeletePreview(kind, recordId);
  const remove = useAdminDelete();
  const [failure, setFailure] = useState<DeleteFailure | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);

  const data = preview.data;
  const previewFailure = preview.isError ? classifyDeleteError(preview.error) : null;
  const isBlocked = failure?.reason === "financial_pending";
  const isBusy = remove.isPending;
  const canConfirm = data !== undefined && !preview.isFetching && !isBusy && !isBlocked;
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
          <GroupsTable preview={data} />
          <DetachedSection preview={data} />
          <p className="delete-confirm__warning">Bu işlem geri alınamaz.</p>
        </>
      )}
    </Modal>
  );
}
