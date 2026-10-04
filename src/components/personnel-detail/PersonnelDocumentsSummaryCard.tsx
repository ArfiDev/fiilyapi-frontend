"use client";

import { useState } from "react";

import { PersonnelDocumentFormModal } from "@/components/personnel-document-form/PersonnelDocumentFormModal";
import { Badge } from "@/components/ui";
import {
  buildDocumentMetaLine,
  DOCUMENT_DOWNLOAD_PENDING_REASON,
  DOCUMENT_NO_FILE_REASON,
  resolveDocumentStatusLabel,
  resolveDocumentStatusVariant,
  resolveDocumentName,
} from "@/components/hr-documents/hr-documents-labels";
import "@/components/hr-documents/hr-documents.css";
import { backendErrorMessage } from "@/lib/api/error-message";
import { usePersonnelDocuments } from "@/lib/api/hooks/useHrDocuments";
import type { PersonnelDetailResponse } from "@/lib/api/hooks/usePersonnelDetail";
import { PERSONNEL_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

export interface PersonnelDocumentsSummaryCardProps {
  /**
   * Belge listesinin sahibi. F-BLG T2c'den beri TÜM personel kaydı gelir
   * (yalnız id değil): ekleme diyaloğu bağlam bandını (ad/meslek/SGK) ve
   * yükleme kapısını (`assigned_project_id`) bu kayıttan okur.
   */
  personnel: PersonnelDetailResponse;
}

/**
 * PD 130-141 · "Belgeler" kartı — F-İK T5'ten beri GERÇEK:
 * `GET /personnel/{personnel_id}/documents` listesi basılır.
 *
 * ⚠️ F-BLG T2c: "+ Ekle" ARTIK GERÇEK — `Form - Personel Belgesi.dc.html`
 * geldi ve düğme `PersonnelDocumentFormModal`ı açar (S-FRM: form yeni rota
 * değil, bu kartın üstünde diyalog). Kartın kendisi hâlâ salt-okunurdur:
 * düzenleme/silme yüzeyi mockup'ta yoktur.
 *
 * ⚠️ Mockup satır altında "PDF · 2.4 MB" gösterir; DOSYA UZANTISI/BOYUTU
 * sunucuda YOKTUR — basılmaz (uydurma yok). Alt satır durum + tarihten kurulur.
 *
 * ⚠️ `status` şemada SERBEST STRING'dir (enum değil): etiket/rozet araması
 * bilinmeyen değere DAYANIKLIdır (`resolve*` fonksiyonları), `as any` YOK.
 */
export function PersonnelDocumentsSummaryCard({
  personnel,
}: PersonnelDocumentsSummaryCardProps) {
  const documentsQuery = usePersonnelDocuments(personnel.id);
  const documents = documentsQuery.data;
  const [isFormOpen, setFormOpen] = useState(false);
  // IZN-F2.x · "+ Ekle" bugün KAPISIZ (fallback true); belge ekle = ik.* Düzenler (VEYA).
  const canAddDocument = useButtonGate({ pages: PERSONNEL_EDIT, need: "edit", fallback: true });

  return (
    <section className="pd-card" data-testid="personnel-documents-card">
      <div className="pd-card__head">
        <h2 className="pd-card__title">Belgeler</h2>
        {/* PD 131 — F-BLG T2c'den beri GERÇEK: belge ekleme diyaloğunu açar */}
        {canAddDocument && (
          <button
            type="button"
            className="pd-card__add-btn"
            onClick={() => setFormOpen(true)}
          >
            + Ekle
          </button>
        )}
      </div>

      {isFormOpen && (
        <PersonnelDocumentFormModal
          personnel={personnel}
          onClose={() => setFormOpen(false)}
        />
      )}

      {documentsQuery.isError ? (
        <div className="pd-card__pending" aria-disabled="true">
          <p className="pd-card__pending-text">
            Belgeler yüklenemedi: {backendErrorMessage(documentsQuery.error)}
          </p>
        </div>
      ) : documentsQuery.isLoading || !documents ? (
        <div className="pd-card__pending" aria-disabled="true">
          <p className="pd-card__pending-text">Yükleniyor…</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="pd-card__pending" aria-disabled="true">
          <p className="pd-card__pending-text">Bu personele ait belge kaydı yok.</p>
        </div>
      ) : (
        <>
          {/* Kayıt 128 — indirme gerekçesi ekranda basılır, yalnız `title`da
              saklanmaz (F-BLG T3/G7). */}
          <p className="pd-card__note" data-testid="pd-download-reason">
            {DOCUMENT_DOWNLOAD_PENDING_REASON}
          </p>
        <div className="pd-doc-list">
          {documents.map((document) => (
            <div
              key={document.id}
              className="pd-doc-row"
              data-testid={`personnel-document-${document.id}`}
            >
              <div className="pd-doc-row__body">
                {/* PD 136 — katalog tipi ya da serbest etiket */}
                <p className="pd-doc-row__name">{resolveDocumentName(document)}</p>
                {/* PD 137 — durum + tarih (dosya bilgisi sunucuda yok) */}
                <p className="pd-doc-row__meta">{buildDocumentMetaLine(document)}</p>
              </div>
              <Badge variant={resolveDocumentStatusVariant(document.status)}>
                {resolveDocumentStatusLabel(document.status)}
              </Badge>
              {/* PD 141 — indirme bu dilimde BAĞLANMAZ (ikili indirme ayrı
                  sözleşme); dosyası olmayan kayıtta gerekçe de farklıdır. */}
              <button
                type="button"
                className="pd-card__download-btn"
                disabled
                title={
                  document.document_id === null
                    ? DOCUMENT_NO_FILE_REASON
                    : DOCUMENT_DOWNLOAD_PENDING_REASON
                }
              >
                İndir
              </button>
            </div>
          ))}
        </div>
        </>
      )}
    </section>
  );
}
