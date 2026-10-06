"use client";

import { useState } from "react";
import Link from "next/link";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui/button/Button";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import { CONTRACT_DISTRIBUTION_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useContractDistribution, useEmployerContract } from "@/lib/api/hooks/useContract";
import { useSaveContractDistribution } from "@/lib/api/hooks/useContractMutations";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { distributeRemaining } from "@/lib/distribute-remaining";
import {
  buildDistributionSaveBody,
  distributionCellKey,
  distributionCellLimitMessage,
  distributionRejectionMessage,
  type DistributionCellEdit,
} from "@/lib/contract-distribution-save";

import { isDistributionMetrajHidden, toDistributeRemainingItem } from "./distribution-derive";
import { employerContractHref } from "./employer-contract-tabs";
import { ContractDistributionGrid } from "./ContractDistributionGrid";
import { ContractDistributionHeaderCard } from "./ContractDistributionHeaderCard";
import { ContractDistributionSaveStatus } from "./ContractDistributionSaveStatus";
import { ContractDistributionSiteSummaries } from "./ContractDistributionSiteSummaries";
import "./contract-distribution.css";

/**
 * POZ · `/sozlesmeler/isveren/[projectId]/poz-dagilimi` (F-P5 T4).
 * Kanon: projedesign `İşveren Sözleşme - Poz Dağılımı.dc.html`; yorumlardaki
 * sayılar o dosyanın SATIR numaralarıdır.
 *
 * ⚠️ Mockup'ın üst şeridi (14-26) uygulamanın Topbar'ıdır — YENİDEN ÇİZİLMEZ
 * (SZL/E14 ile aynı karar). Şeridin kırıntısı (19-21) ve "Dağılımı Kaydet"
 * butonu (24) sayfanın kendi eylem satırına iner, çünkü kabukta eylem yuvası
 * yoktur.
 *
 * 🛑 **KAYDETME = BİRLEŞTİRME (hakediş/puantaj PUT'unun TAM TERSİ).** Gövde
 * BURADA KURULMAZ: saf üretici `buildDistributionSaveBody` (T1) çağrılır.
 *   - yalnız KİRLİ hücreler gövdeye girer,
 *   - boşaltılan hücre `quantity: null` (bağ koparma; satır silinmez),
 *   - dokunulmamış hücre GÖNDERİLMEZ ve sunucuda KORUNUR,
 *   - `0` ASLA gönderilmez → üretici reddeder, kaydetme HİÇ BAŞLAMAZ ve
 *     gerekçe ekranda görünür (sessizce `null`a çevrilmez).
 *
 * "Σ kota = sözleşme miktarı olmalı" (72) YUMUŞAK gösterimdir (Kalan rozeti);
 * hard validation EKLENMEZ — backend yalnız `≤` uygular, aşımda 422 döner ve
 * Türkçe mesajı olduğu gibi basılır.
 */
export interface ContractDistributionViewProps {
  projectId: string;
}

export function ContractDistributionView({ projectId }: ContractDistributionViewProps) {
  // IZN-F2.x · poz dağılımı kaydet = sözleşme sayfaları Düzenler (VEYA).
  const canEditContracts = useButtonGate({ pages: CONTRACT_DISTRIBUTION_EDIT, need: "edit" });
  const distributionQuery = useContractDistribution(projectId);
  const contractQuery = useEmployerContract(projectId);
  const projectQuery = useProject(projectId);
  const saveMutation = useSaveContractDistribution(projectId);

  /** Kirli hücreler: anahtar `distributionCellKey`, değer HAM metin. */
  const [edits, setEdits] = useState<ReadonlyMap<string, DistributionCellEdit>>(new Map());
  const [rejectionMessages, setRejectionMessages] = useState<readonly string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  /** KDG K7 · son "Kalanı buraya dağıt" sonucu (bilgi satırları). */
  const [distributeNotices, setDistributeNotices] = useState<readonly string[]>([]);

  useUnsavedChanges(edits.size > 0, "Poz dağılımı");

  if (isForbidden(distributionQuery.error)) return <AccessDenied />;

  const data = distributionQuery.data;
  const isMetrajHidden = data !== undefined && isDistributionMetrajHidden(data.groups);
  const distributeBlockReason = !canEditContracts
    ? "Kalanı dağıtma kapalı: yazma izniniz yok."
    : isMetrajHidden
      ? "Kalanı dağıtma kapalı: metraj bu rol için gizli."
      : null;

  function handleCellChange(contractItemId: string, siteId: string, value: string) {
    // Mutasyonsuz güncelleme: her düzenleme YENİ bir Map üretir.
    const next = new Map(edits);
    next.set(distributionCellKey(contractItemId, siteId), { contractItemId, siteId, value });
    setEdits(next);
    setIsSaved(false);
    setDistributeNotices([]);
  }

  /**
   * KDG K7 (CEO 2026-10-01) · her kalemin EKRANDAKİ kalanını `siteId` kolonuna
   * ekler. Hesap saf yardımcıda (`distribute-remaining.ts`); burada yalnız
   * adaptör var. TEK `setEdits` ⇒ tek render. Yazma yine "Dağılımı Kaydet"le.
   */
  function handleDistributeRemaining(siteId: string) {
    if (!data) return;
    const items = data.groups.flatMap((group) => group.items);
    const distributeItems = items.flatMap((item) => {
      const mapped = toDistributeRemainingItem(item);
      return mapped === null ? [] : [mapped];
    });
    const drafts = new Map([...edits].map(([key, edit]) => [key, edit.value]));
    const result = distributeRemaining({
      items: distributeItems,
      columnIds: data.sites.map((site) => site.id),
      targetColumnId: siteId,
      drafts,
      cellKey: distributionCellKey,
    });

    const itemIdByKey = new Map(
      distributeItems.map((item) => [distributionCellKey(item.id, siteId), item.id]),
    );
    const next = new Map(edits);
    for (const key of result.changedKeys) {
      const contractItemId = itemIdByKey.get(key);
      const value = result.drafts.get(key);
      if (contractItemId === undefined || value === undefined) continue;
      next.set(key, { contractItemId, siteId, value });
    }

    const notices: string[] = [];
    if (result.changedCount === 0) notices.push("Dağıtılacak kalan yok.");
    if (result.skippedCount > 0) {
      notices.push(
        `${result.skippedCount} kalem atlandı: geçersiz taslak ya da sözleşme miktarını aşan dağılım var.`,
      );
    }
    setEdits(next);
    setDistributeNotices(notices);
    setIsSaved(false);
  }

  async function handleSave() {
    setDistributeNotices([]);
    const build = buildDistributionSaveBody([...edits.values()]);

    if (build.cellLimitExceeded) {
      setRejectionMessages([distributionCellLimitMessage()]);
      setSaveError(null);
      setIsSaved(false);
      return;
    }
    // 🛑 Reddedilen hücre varsa istek HİÇ ATILMAZ.
    if (build.rejections.length > 0) {
      setRejectionMessages(
        build.rejections.map(
          (rejection) =>
            `${cellLabel(rejection.edit)}: ${distributionRejectionMessage(rejection.reason)}`,
        ),
      );
      setSaveError(null);
      setIsSaved(false);
      return;
    }

    setRejectionMessages([]);
    setSaveError(null);
    try {
      await saveMutation.mutateAsync(build.body);
      // Başarıda önbelleği mutasyon hook'u `setQueryData` ile tazeler —
      // ızgara EK REFETCH YAPMAZ, yalnız kirli haritayı boşaltır.
      setEdits(new Map());
      setIsSaved(true);
    } catch (error) {
      // 422 dahil TÜM sunucu hataları Türkçe basılır (aşım mesajı backend'den
      // gelir, uydurulmaz).
      setSaveError(backendErrorMessage(error, "Poz dağılımı kaydedilemedi."));
      setIsSaved(false);
    }
  }

  /** Ret mesajının başına hangi hücre olduğunu yazar (poz kodu · şantiye). */
  function cellLabel(edit: DistributionCellEdit): string {
    const item = data?.groups
      .flatMap((group) => group.items)
      .find((candidate) => candidate.id === edit.contractItemId);
    const site = data?.sites.find((candidate) => candidate.id === edit.siteId);
    return `${item?.code ?? edit.contractItemId} · ${site?.name ?? edit.siteId}`;
  }

  return (
    <div className="cdist">
      {/* 18-25 */}
      <div className="cdist__bar">
        <nav className="cdist__crumb" aria-label="Kırıntı">
          {/* 19 */}
          <Link href={employerContractHref(projectId)} className="cdist__back">
            ← {contractQuery.data?.contract_no ?? "Sözleşme"}
          </Link>
          <span className="cdist__crumb-sep">/</span>
          {/* 21 */}
          <span className="cdist__crumb-current">Poz Dağılımı</span>
        </nav>
        <div className="cdist__bar-actions">
          {/* 24 — salt-okur kullanıcıda GİZLENMEZ, devre-dışı basılır (üst
              kural); değişiklik yokken de devre dışıdır (boş gövde göndermek
              anlamsız istek olurdu). */}
          <Button
            disabled={!canEditContracts || edits.size === 0 || saveMutation.isPending}
            onClick={() => void handleSave()}
            data-testid="cdist-save"
          >
            Dağılımı Kaydet
          </Button>
        </div>
      </div>

      {/* 32-39 — açıklama bandı, metni mockup'tan birebir. */}
      <section className="cdist-intro" aria-label="Poz Dağılımı açıklaması">
        <p className="cdist-intro__title">Poz Dağılımı — Ne işe yarar?</p>
        <p className="cdist-intro__text">
          İşveren sözleşmesindeki her poz, projenin birden fazla şantiyesine bölünebilir.
          Örneğin sözleşmede <strong>200 Ton demir</strong> varsa → A-Blok: 120 Ton, B-Blok: 80
          Ton olarak paylaştırırsın. Her şantiye kendi kotasını günlük kayıtla tüketir. Hakediş
          oluşturulurken bu dağılım baz alınır.
        </p>
      </section>

      {distributionQuery.isError ? (
        <p className="cdist__message">Poz dağılımı yüklenemedi</p>
      ) : !data ? (
        <p className="cdist__message">Yükleniyor…</p>
      ) : (
        <>
          <ContractDistributionHeaderCard
            detail={contractQuery.data}
            isDetailError={contractQuery.isError}
            projectName={projectQuery.data?.name}
            siteCount={data.sites.length}
            distributedItemCount={data.distributed_item_count}
            totalItemCount={data.total_item_count}
          />

          {/* 63-66 — yalnız dağıtılmamış kalem VARSA. */}
          {data.undistributed_item_count > 0 && (
            <p className="cdist-warning" data-testid="cdist-undistributed-warning">
              <span aria-hidden="true">⚠️</span>
              <span>
                <strong>{data.undistributed_item_count} poz henüz dağıtılmadı:</strong>{" "}
                {data.undistributed_item_names.join(", ")} — şantiye ataması yapılmadan günlük
                kayıt ve hakediş yapılamaz.
              </span>
            </p>
          )}

          {!canEditContracts && (
            <p className="cdist__message" data-testid="cdist-readonly-notice">
              Sözleşme modülünde yazma izniniz yok — kotalar salt okunur.
            </p>
          )}

          <ContractDistributionSaveStatus
            dirtyCount={edits.size}
            isSaving={saveMutation.isPending}
            isSaved={isSaved}
            noticeMessages={distributeNotices}
            rejectionMessages={rejectionMessages}
            saveError={saveError}
          />

          {distributeBlockReason !== null && (
            <p className="cdist__message" data-testid="cdist-distribute-reason">
              {distributeBlockReason}
            </p>
          )}

          <ContractDistributionGrid
            sites={data.sites}
            groups={data.groups}
            edits={new Map([...edits].map(([key, edit]) => [key, edit.value]))}
            canWrite={canEditContracts}
            onCellChange={handleCellChange}
            onDistributeRemaining={handleDistributeRemaining}
            isDistributeDisabled={distributeBlockReason !== null}
          />

          <ContractDistributionSiteSummaries
            summaries={data.site_summaries}
            groups={data.groups}
          />
        </>
      )}
    </div>
  );
}
