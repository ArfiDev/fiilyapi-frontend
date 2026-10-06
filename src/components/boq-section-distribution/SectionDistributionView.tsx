"use client";

import { useState } from "react";
import Link from "next/link";

import { MASKED_QUANTITY_REASON } from "@/components/boq-assignment/BoqAssignmentCard";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui/button/Button";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  useSaveSectionDistribution,
  useSectionDistribution,
  type SectionDistributionItem,
} from "@/lib/api/hooks/useSectionDistribution";
import { isForbidden } from "@/lib/api/unwrap";
import { BOQ_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { distributeRemaining } from "@/lib/distribute-remaining";
import {
  buildSectionDistributionSaveBody,
  sectionDistributionCellKey,
  sectionDistributionCellLimitMessage,
  sectionDistributionRejectionMessage,
  type SectionDistributionCellEdit,
} from "@/lib/section-distribution-save";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { ContractDistributionSaveStatus } from "../contracts/ContractDistributionSaveStatus";
import {
  buildUnallocatedWarning,
  isSectionDistributionMetrajHidden,
  toDistributeRemainingItem,
} from "./derive";
import { SectionDistributionGrid } from "./SectionDistributionGrid";
import { SectionDistributionHeaderCard } from "./SectionDistributionHeaderCard";
import { SectionSummaries } from "./SectionSummaries";
import "../contracts/contract-distribution.css";
import "./section-distribution.css";

/**
 * BDG · `/projeler/{p}/santiyeler/{s}/is-kalemleri/bolum-dagilimi`.
 * K1: yerleşim ve bileşen dili sözleşme Poz Dağılımı ekranı
 * (`ContractDistributionView`) ile AYNI; mockup yazılmadı.
 *
 * 🛑 **KAYDETME = BİRLEŞTİRME.** Gövde BURADA KURULMAZ:
 * `buildSectionDistributionSaveBody` yalnız KİRLİ hücreleri alır, boşaltılan
 * hücre `quantity: null` (ANAHTARLI), `0` görünür ret (istek HİÇ atılmaz),
 * dokunulmayan hücre sunucuda KORUNUR. 422 detail AYNEN basılır.
 *
 * Yazma kapısı: `boq` izni en az `full` VE metraj gizli DEĞİL (herhangi bir
 * kalemde `quantity` null ⇒ gizli; fail-closed). K3 uyarısı bilgidir, engel
 * değil.
 */
export interface SectionDistributionViewProps {
  /** Kanonik şantiye kimliği; adres anahtarı çözülene dek boş olabilir. */
  siteId: string;
  /** "← İş Kalemleri" kırıntısının hedefi. */
  boqHref: string;
  /** Şantiye çözümü başarısız oldu (kimlik hiç gelmeyecek). */
  isSiteError?: boolean;
  /** IZN-F3.2b · Adres anahtarı (UUID ya da slug): yazma kapısı o projedeki rolden okunur. Opsiyonel. */
  projectKey?: string;
}

const NO_FULL_PERMISSION_REASON =
  "İş kalemleri modülünde tam yetkiniz yok — dağılım salt okunur.";

export function SectionDistributionView({
  siteId,
  boqHref,
  isSiteError = false,
  projectKey,
}: SectionDistributionViewProps) {
  // IZN-F2.x · bölüm dağılımı kaydet = santiye.is_kalemleri/bolum_dagilimi Düzenler (VEYA).
  const hasFullPermission = useButtonGate({
    pages: BOQ_EDIT,
    need: "edit",
    projectId: projectKey,
  });
  const distributionQuery = useSectionDistribution(siteId);
  const saveMutation = useSaveSectionDistribution(siteId);

  /** Kirli hücreler: anahtar `sectionDistributionCellKey`, değer HAM metin. */
  const [edits, setEdits] = useState<ReadonlyMap<string, SectionDistributionCellEdit>>(new Map());
  const [rejectionMessages, setRejectionMessages] = useState<readonly string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [distributeNotices, setDistributeNotices] = useState<readonly string[]>([]);

  useUnsavedChanges(edits.size > 0, "Bölüm dağılımı");

  if (isForbidden(distributionQuery.error)) return <AccessDenied />;

  const data = distributionQuery.data;
  const isMetrajHidden = data !== undefined && isSectionDistributionMetrajHidden(data.groups);
  const canWrite = hasFullPermission && !isMetrajHidden;
  const writeBlockReason = !hasFullPermission
    ? NO_FULL_PERMISSION_REASON
    : isMetrajHidden
      ? MASKED_QUANTITY_REASON
      : null;

  function handleCellChange(boqItemId: string, sectionId: string, value: string) {
    const next = new Map(edits);
    next.set(sectionDistributionCellKey(boqItemId, sectionId), { boqItemId, sectionId, value });
    setEdits(next);
    setIsSaved(false);
    setDistributeNotices([]);
  }

  /** KDG K7: her kalemin EKRANDAKİ atanmamışını `sectionId` kolonuna ekler; yazma "Dağılımı Kaydet"le. */
  function handleDistributeRemaining(sectionId: string) {
    if (!data || !canWrite) return;
    const distributeItems = data.groups
      .flatMap((group) => group.items)
      .flatMap((item) => {
        const mapped = toDistributeRemainingItem(item);
        return mapped === null ? [] : [mapped];
      });
    const drafts = new Map([...edits].map(([key, edit]) => [key, edit.value]));
    const result = distributeRemaining({
      items: distributeItems,
      columnIds: data.sections.map((section) => section.id),
      targetColumnId: sectionId,
      drafts,
      cellKey: sectionDistributionCellKey,
    });

    const itemIdByKey = new Map(
      distributeItems.map((item) => [sectionDistributionCellKey(item.id, sectionId), item.id]),
    );
    const next = new Map(edits);
    for (const key of result.changedKeys) {
      const boqItemId = itemIdByKey.get(key);
      const value = result.drafts.get(key);
      if (boqItemId === undefined || value === undefined) continue;
      next.set(key, { boqItemId, sectionId, value });
    }

    const notices: string[] = [];
    if (result.changedCount === 0) notices.push("Dağıtılacak kalan yok.");
    if (result.skippedCount > 0) {
      notices.push(
        `${result.skippedCount} kalem atlandı: geçersiz taslak ya da şantiye kotasını aşan dağılım var.`,
      );
    }
    setEdits(next);
    setDistributeNotices(notices);
    setIsSaved(false);
  }

  function cellLabel(edit: SectionDistributionCellEdit): string {
    const item: SectionDistributionItem | undefined = data?.groups
      .flatMap((group) => group.items)
      .find((candidate) => candidate.id === edit.boqItemId);
    const section = data?.sections.find((candidate) => candidate.id === edit.sectionId);
    return `${item?.code ?? edit.boqItemId} · ${section?.name ?? edit.sectionId}`;
  }

  async function handleSave() {
    setDistributeNotices([]);
    const build = buildSectionDistributionSaveBody(edits);

    if (build.cellLimitExceeded) {
      setRejectionMessages([sectionDistributionCellLimitMessage()]);
      setSaveError(null);
      setIsSaved(false);
      return;
    }
    // 🛑 Reddedilen hücre varsa istek HİÇ ATILMAZ.
    if (build.rejections.length > 0) {
      setRejectionMessages(
        build.rejections.map(
          (rejection) =>
            `${cellLabel(rejection.edit)}: ${sectionDistributionRejectionMessage(rejection.reason)}`,
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
      // Önbelleği mutasyon hook'u `setQueryData` ile tazeler; burada yalnız
      // kirli harita boşalır (ek refetch yok).
      setEdits(new Map());
      setIsSaved(true);
    } catch (error) {
      setSaveError(backendErrorMessage(error, "Bölüm dağılımı kaydedilemedi."));
      setIsSaved(false);
    }
  }

  const unallocatedWarning = data === undefined ? null : buildUnallocatedWarning(data);

  return (
    <div className="cdist">
      <div className="cdist__bar">
        <nav className="cdist__crumb" aria-label="Kırıntı">
          <Link href={boqHref} className="cdist__back">
            ← İş Kalemleri
          </Link>
          <span className="cdist__crumb-sep">/</span>
          <span className="cdist__crumb-current">Bölüm Dağılımı</span>
        </nav>
        <div className="cdist__bar-actions">
          <Button
            disabled={!canWrite || edits.size === 0 || saveMutation.isPending}
            onClick={() => void handleSave()}
            data-testid="bdg-save"
          >
            Dağılımı Kaydet
          </Button>
        </div>
      </div>

      <section className="cdist-intro" aria-label="Bölüm Dağılımı açıklaması">
        <p className="cdist-intro__title">Bölüm Dağılımı — Ne işe yarar?</p>
        <p className="cdist-intro__text">
          Şantiyedeki her iş kalemi birden fazla bölüme bölünebilir. Örneğin 1.200 m³ betonun
          400&apos;ü Kat 6-10&apos;a, 300&apos;ü Kat 11-15&apos;e verilir; kalan atanmamış havuzda
          bekler. Günlük kayıtta bölüm seçimi bu dağılımı kullanır.
        </p>
      </section>

      {distributionQuery.isError || isSiteError ? (
        <p className="cdist__message">Bölüm dağılımı yüklenemedi</p>
      ) : !data ? (
        <p className="cdist__message">Yükleniyor…</p>
      ) : (
        <>
          <SectionDistributionHeaderCard
            siteName={data.site_name}
            projectName={data.project_name}
            sectionCount={data.sections.length}
            distributedItemCount={data.distributed_item_count}
            totalItemCount={data.total_item_count}
          />

          {/* K3: yalnız atanmamış kalem VARSA; bilgi, kaydı ENGELLEMEZ. */}
          {unallocatedWarning !== null && (
            <p className="cdist-warning" data-testid="bdg-unallocated-warning">
              <span aria-hidden="true">⚠️</span>
              <span>{unallocatedWarning}</span>
            </p>
          )}

          {writeBlockReason !== null && (
            <p className="bdg-write-reason" data-testid="bdg-write-reason">
              {writeBlockReason}
            </p>
          )}

          <ContractDistributionSaveStatus
            dirtyCount={edits.size}
            isSaving={saveMutation.isPending}
            isSaved={isSaved}
            savedText="Bölüm dağılımı kaydedildi."
            noticeMessages={distributeNotices}
            rejectionMessages={rejectionMessages}
            saveError={saveError}
          />

          <SectionDistributionGrid
            sections={data.sections}
            groups={data.groups}
            edits={new Map([...edits].map(([key, edit]) => [key, edit.value]))}
            canWrite={canWrite}
            onCellChange={handleCellChange}
            onDistributeRemaining={handleDistributeRemaining}
            isDistributeDisabled={!canWrite}
          />

          <SectionSummaries summaries={data.section_summaries} />
        </>
      )}
    </div>
  );
}
