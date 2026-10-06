"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui/button/Button";
import { useContracts } from "@/lib/api/hooks/useContracts";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { SUBCONTRACTOR_CONTRACT_CREATE_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { ContractsSummaryStrip } from "./ContractsSummaryStrip";
import { ContractsTable } from "./ContractsTable";
import { ContractTypeTabs } from "./ContractTypeTabs";
import { parseContractTab } from "./contract-tabs";
import "./contracts.css";
import { routes } from "@/lib/routes";

/**
 * SZL · `/sozlesmeler` (F-P5 T2). Mockup `Sözleşmeler.dc.html` 21-108
 * birebir: başlık + alt satır (24) · sekme çifti (26-29) · "+ Yeni Sözleşme"
 * (30) · 4 KPI (34-38) · tablo (41-106).
 *
 * ⚠️ Mockup'ın kendi üst şeridi (14-20: logo + "Sözleşme & Mali" +
 * "← Dashboard") UYGULAMA KABUĞUdur (F3 Topbar + Sidebar) — sayfa onu
 * YENİDEN ÇİZMEZ; kabuk deseni bozulmaz (mockup'lar arası kabuk kararı,
 * tüm ekranlarda aynı).
 *
 * ⚠️ Bu uçta SAYFALAMA YOKTUR (`ContractListResponse` yalnız `summary`+`items`)
 * — `buildListTruncation` korkuluğu burada UYGULANMAZ, kırpılma kavramı
 * tanımsızdır (T1 notu).
 *
 * Mockup'ta arama/filtre kutusu YOKTUR (23-32 arasında yalnız sekme + buton
 * var); `GET /contracts`in `q`/`status`/`project_id` parametreleri bu ekranda
 * KULLANILMAZ — mockup'ta olmayan kontrol İCAT EDİLMEZ.
 */
export function ContractsView() {
  const searchParams = useSearchParams();
  const tab = parseContractTab(searchParams);
  const contractsQuery = useContracts({ type: tab });
  // M5_3 #400 — taşeron sekmesindeki "+ Yeni Sözleşme" eskiden HİÇ izin
  // kontrolüyle sarılmadan render ediliyordu; kapı yalnız hedef formda
  // (SubcontractorContractCreateView) vardı. Backend yine de yazmayı
  // reddeder ama liste ekranında görünür/tıklanabilir bir buton yanlış bir
  // yetki izlenimi verirdi.
  const permission = useModulePermission("contracts");
  // IZN-F2.x · sözleşme/firma ekle = sözleşme sayfaları Düzenler (VEYA).
  const canEditContracts = useButtonGate({ pages: SUBCONTRACTOR_CONTRACT_CREATE_EDIT, need: "edit", fallback: permission.canWrite });

  if (isForbidden(contractsQuery.error)) return <AccessDenied />;

  const summary = contractsQuery.data?.summary;

  return (
    <div className="szl">
      <div className="szl__head">
        <div>
          <h1 className="szl__title">Sözleşmeler</h1>
          {/* 24: "Tüm projeler · 6 aktif sözleşme" — sayı `active_count`ten. */}
          <div className="szl__subtitle">
            Tüm projeler{summary ? ` · ${summary.active_count} aktif sözleşme` : ""}
          </div>
        </div>
        <div className="szl__actions">
          {/* Yalnız TAŞERON sekmesinde görünen giriş (spec §1: SZL taşeron
              sekmesinde "Taşeron Firmaları →" girişi). Mockup yalnız işveren
              sekmesini çizdiği için bu öğenin mockup'ta karşılığı YOKTUR —
              spec'in zorunlu kıldığı ek. Hedef `/sozlesmeler/taseronlar`
              (TL) T5'te yazılacak. */}
          {tab === "subcontractor" && (
            <Link href={routes.contracts.subcontractorList()} className="szl__link-action">
              Taşeron Firmaları →
            </Link>
          )}

          <ContractTypeTabs active={tab} />

          {/* 30 "+ Yeni Sözleşme" — ONAYLI KARAR S2: taşeron sekmesinde FSO
              formuna gider, işveren sekmesinde DEVRE DIŞI + görünür gerekçe
              (işveren sözleşmesi proje formunda kurulur). Buton SİLİNMEZ. */}
          {tab === "subcontractor" && canEditContracts ? (
            <Link href={routes.contracts.newSubcontractor()} className="szl__new-btn">
              + Yeni Sözleşme
            </Link>
          ) : (
            <Button
              variant="primary"
              className="szl__new-btn szl__new-btn--disabled"
              disabled
              title={
                tab === "subcontractor" ? WRITE_PERMISSION_REASON : EMPLOYER_NEW_REASON
              }
              data-testid="szl-new-contract-disabled"
            >
              + Yeni Sözleşme
            </Button>
          )}
        </div>
      </div>

      {tab === "employer" && <p className="szl__notice">{EMPLOYER_NEW_REASON}</p>}

      <ContractsSummaryStrip summary={summary} />

      <ContractsTable
        type={tab}
        isError={contractsQuery.isError}
        isLoading={contractsQuery.isLoading}
        items={contractsQuery.data?.items}
      />
    </div>
  );
}

/** S2 gerekçesi — hem butonun `title`ı hem ekrandaki görünür not. */
const EMPLOYER_NEW_REASON = "İşveren sözleşmesi proje formunda kurulur.";

/** M5_3 #400 — yazma yetkisi yoksa taşeron sekmesindeki buton bu gerekçeyi taşır. */
const WRITE_PERMISSION_REASON = "Bu modülde yazma yetkiniz yok.";
