"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { ProgressPaymentsListBody } from "@/components/progress-payments/ProgressPaymentsList";
import { EmployerItemFormModal } from "@/components/contract-item-form/EmployerItemFormModal";
import { useEmployerContract, useEmployerContractItems } from "@/lib/api/hooks/useContract";
import {
  useCreateEmployerContractItem,
  useUpdateEmployerContractItem,
} from "@/lib/api/hooks/useContractMutations";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { EmployerItemCreateBody } from "@/components/contract-item-form/build-body";
import type { EmployerItemUpdateBody } from "./employer-item-inline";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useProject } from "@/lib/api/hooks/useProjects";
import { isForbidden } from "@/lib/api/unwrap";

import { contractTabHref } from "./contract-tabs";
import { ContractDocumentsPendingCard } from "./ContractDocumentsPendingCard";
import { ContractMilestonesCard } from "./ContractMilestonesCard";
import { ContractPaymentSummaryCard } from "./ContractPaymentSummaryCard";
import { ContractTermsCard } from "./ContractTermsCard";
import {
  EmployerContractHeaderCard,
  EDIT_DISABLED_REASON,
  PDF_DISABLED_REASON,
} from "./EmployerContractHeaderCard";
import { EmployerCatalogPickerHost } from "./EmployerCatalogPickerHost";
import { EmployerContractItemsTable } from "./EmployerContractItemsTable";
import { EmployerContractTabs } from "./EmployerContractTabs";
import { parseEmployerContractTab } from "./employer-contract-tabs";
import "./employer-contract-detail.css";
import { routes } from "@/lib/routes";

/**
 * E14 · `/sozlesmeler/isveren/[projectId]` (F-P5 T3). Kanon: projedesign
 * `Ekran 14 - Sözleşme Detay.dc.html`.
 *
 * ⚠️ Segment PROJE kimliğidir (proje başına TEK işveren sözleşmesi; SZL
 * satırının `item.id`si de projenin kimliğidir — `ContractsTable` notu).
 *
 * ⚠️ Mockup'ın üst şeridi + sol menüsü (20-59) UYGULAMA KABUĞUdur (F3
 * Topbar + Sidebar) — sayfa onları YENİDEN ÇİZMEZ (SZL ile aynı karar).
 *
 * Sekme durumu URL'dedir (`?tab=`, bkz. `employer-contract-tabs.ts`) — T2'nin
 * `?type=` deseniyle tutarlı.
 */
export interface EmployerContractDetailViewProps {
  projectId: string;
}

/** Başarı bildiriminin görünme süresi (KIK toast süresi, ÜS-F2-7). */
const ADDED_NOTICE_MS = 2800;

/** "+ Poz Ekle" hangi diyaloğu açtı: katalog seçicisi (varsayılan) ya da eski tekli form. */
type AddItemDialog = "catalog" | "manual" | null;

export function EmployerContractDetailView({ projectId }: EmployerContractDetailViewProps) {
  const searchParams = useSearchParams();
  const tab = parseEmployerContractTab(searchParams);

  const contractQuery = useEmployerContract(projectId);
  const projectQuery = useProject(projectId);
  // İş Kalemleri sekmesi açıkken çağrılır — diğer sekmelerde ağa çıkılmaz
  // (`useEmployerContractItems` boş id ile `enabled: false` olur).
  const itemsQuery = useEmployerContractItems(tab === "items" ? projectId : "");
  // Hakedişler sekmesi PROJE FİLTRELİdir — bu ekran tek bir sözleşmenin
  // (=tek projenin) hakedişlerini gösterir, proje-genel liste DEĞİL.
  // ⚠️ Filtre sekmeye göre KOŞULLANDIRILMAZ: `useProgressPayments({})` boş
  // filtreyle TÜM projelerin hakedişlerini çeker — sekme değişiminde yanlış
  // önbellek anahtarı ısıtmamak için `project_id` HER ZAMAN gönderilir.
  const paymentsQuery = useProgressPayments({ project_id: projectId });

  // 84 · başlık kartının "Bitiş Tarihi" tonunun okuduğu TEK "bugün".
  // Mount'ta bir kez dondurulur (`InvoiceDetailView` emsali): her render'da
  // `new Date()` çağrılsaydı ton bir oturum ortasında sessizce kayabilirdi.
  const [today] = useState(() => new Date());

  // F-BLG T2a · "+ Poz Ekle" diyalogu; sahibi bu ekrandır (tablo yalnız tetikler).
  // TKL-F2.4 (ÜS-F2-1): düğme önce KATALOG SEÇİCİSİNİ açar; seçicideki "Elle poz ekle"
  // köprüsü eski tekli formu açar (seçici o anda kapanır).
  const [addDialog, setAddDialog] = useState<AddItemDialog>(null);

  // ÜS-F2-7 · toplu eklemeden sonra "N poz eklendi" (tablo başlığında, 2800 ms). `id` her
  // bildirimde artar → art arda iki ekleme ilkinin zamanlayıcısıyla erken kapanmaz.
  const [addedNotice, setAddedNotice] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    if (addedNotice === null) return;
    const timer = setTimeout(() => setAddedNotice(null), ADDED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [addedNotice]);

  // F-ISVPOZ · satır-içi düzenleme/ekleme yazmaları. Mutasyon sahibi EKRANDIR
  // (taşeron emsalinde de öyle: kart yalnız taslak tutar ve tetikler).
  const [saveError, setSaveError] = useState<string | null>(null);
  const updateItem = useUpdateEmployerContractItem(projectId);
  const createItem = useCreateEmployerContractItem(projectId);
  // Yalnız YENİ SATIR oluşturma kilitler; update PATCH'i hücreleri kilitlemez
  // (Tab ile komşu hücreye geçerken odak <body>'ye düşmesin).
  const isCreatingItem = createItem.isPending;

  // `mutateAsync` (mutate DEĞİL): react-query aynı gözlemcide yalnız SON
  // `mutate` çağrısının çağrı-düzeyi geri çağrılarını çalıştırır; paralel iki
  // hücre PATCH'inde ilkinin hatası sessizce yutulurdu.
  async function handleCommitItem(itemId: string, body: EmployerItemUpdateBody): Promise<string | null> {
    try {
      await updateItem.mutateAsync({ itemId, body });
      return null;
    } catch (error) {
      // Hata TABLODA hücre anahtarıyla tutulur; burada tek-string YOK (yeni bir
      // commit başka hücrenin hatasını silmesin). `saveError` yalnız ekleme içindir.
      return backendErrorMessage(error);
    }
  }

  async function handleCreateItem(body: EmployerItemCreateBody): Promise<boolean> {
    setSaveError(null);
    try {
      await createItem.mutateAsync(body);
      return true;
    } catch (error) {
      setSaveError(backendErrorMessage(error));
      return false;
    }
  }

  if (isForbidden(contractQuery.error)) return <AccessDenied />;

  const detail = contractQuery.data;

  return (
    <div className="ecd">
      {/* 62 · "← Sözleşmeler" — liste rotasına `contractTabHref` ile döner. */}
      <Link href={contractTabHref("employer")} className="ecd__back">
        ← Sözleşmeler
      </Link>

      {contractQuery.isError ? (
        <p className="ecd__message">Sözleşme yüklenemedi</p>
      ) : !detail ? (
        <p className="ecd__message">Yükleniyor…</p>
      ) : (
        <>
          <EmployerContractHeaderCard
            detail={detail}
            projectName={projectQuery.data?.name}
            today={today}
          />

          {/* 76-77 · iki devre-dışı butonun gerekçesi `title`da saklı kalmaz. */}
          <p className="ecd__notice">
            PDF: {PDF_DISABLED_REASON}. Düzenle: {EDIT_DISABLED_REASON} —{" "}
            <Link href={routes.projects.detail({ projectId })} className="ecd__notice-link">
              projeye git →
            </Link>
          </p>

          <EmployerContractTabs projectId={projectId} active={tab} />

          {tab === "general" && (
            <>
              <div className="ecd-grid">
                <ContractMilestonesCard projectId={projectId} />
                <ContractPaymentSummaryCard
                  summary={detail.progress_payment_summary}
                  retainagePct={detail.retainage_pct}
                />
              </div>
              {/* §7 S3 — mockup gövdesinin DIŞINDA, ayrı bölüm. */}
              <div className="ecd-terms-section">
                <ContractTermsCard detail={detail} />
              </div>
            </>
          )}

          {tab === "items" && (
            <>
              <EmployerContractItemsTable
                projectId={projectId}
                detail={detail}
                isError={itemsQuery.isError}
                isLoading={itemsQuery.isLoading}
                data={itemsQuery.data}
                onAddItem={() => setAddDialog("catalog")}
                addedNotice={addedNotice?.text ?? null}
                onCommitItem={handleCommitItem}
                onCreateItem={handleCreateItem}
                isCreating={isCreatingItem}
                saveError={saveError}
              />
              {addDialog === "catalog" && itemsQuery.data && (
                <EmployerCatalogPickerHost
                  projectId={projectId}
                  projectName={projectQuery.data?.name}
                  groups={itemsQuery.data.groups}
                  onClose={() => setAddDialog(null)}
                  onManualAdd={() => setAddDialog("manual")}
                  onAdded={(count) =>
                    setAddedNotice((current) => ({
                      text: `${count} poz eklendi`,
                      id: (current?.id ?? 0) + 1,
                    }))
                  }
                />
              )}
              {addDialog === "manual" && itemsQuery.data && (
                <EmployerItemFormModal
                  projectId={projectId}
                  groups={itemsQuery.data.groups}
                  detail={detail}
                  onClose={() => setAddDialog(null)}
                />
              )}
            </>
          )}

          {tab === "payments" &&
            /*
             * 🔴 `progress_payments` `contracts`tan AYRI bir izin anahtarıdır
             * (backend `progress_payments/router.py:44`). `contracts:view`
             * olan ama `progress_payments:none` olan kullanıcı bu sekmede
             * 403 alır — `ContractMilestonesCard`teki 403 deseniyle AYNI:
             * "yüklenemedi" demek yerine yetki sınırı SÖYLENİR.
             */
            (isForbidden(paymentsQuery.error) ? (
              <p className="ecd__message" data-testid="ecd-payments-forbidden">
                Hakedişleri görme yetkiniz yok.
              </p>
            ) : (
              /* F-P7 bileşeni PAYLAŞILIR (yeniden yazılmaz). Proje adı bu ekranda
                 başlıkta zaten var → `showProjectName={false}` (mevcut prop). */
              <ProgressPaymentsListBody
                isError={paymentsQuery.isError}
                isLoading={paymentsQuery.isLoading}
                data={paymentsQuery.data}
                showProjectName={false}
                emptyScope="contract"
              />
            ))}

          {tab === "documents" && <ContractDocumentsPendingCard />}
        </>
      )}
    </div>
  );
}
