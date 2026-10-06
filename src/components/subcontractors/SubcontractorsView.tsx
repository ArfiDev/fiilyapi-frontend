"use client";

import { useMemo, useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Input, Select } from "@/components/ui";
import { SearchIcon } from "@/components/ui/icons";
import { useContracts } from "@/lib/api/hooks/useContracts";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useSubcontractorProgressPayments } from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { SUBCONTRACTOR_PAYMENT_LIST_MAX_LIMIT } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";
import { isForbidden } from "@/lib/api/unwrap";
import { SUBCONTRACTOR_CREATE_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { SubcontractorFormModal } from "./SubcontractorFormModal";
import { SubcontractorsSummaryStrip } from "./SubcontractorsSummaryStrip";
import { SubcontractorsTable } from "./SubcontractorsTable";
import { PAYMENT_FORBIDDEN_REASON, PAYMENT_PENDING_REASON } from "./pending-reasons";
import {
  buildSubcontractorDirectory,
  filterSubcontractorRows,
} from "./subcontractor-aggregate";
import "./subcontractors.css";

/**
 * TL · `/sozlesmeler/taseronlar` (F-P5 T5). Mockup `Taşeron Listesi.dc.html`
 * 21-109 birebir: başlık + alt satır (24) · arama kutusu (26-29) · kategori
 * süzgeci (30) · 4 KPI (34-38) · tablo (41-107).
 *
 * ⚠️ Mockup'ın üst şeridi (14-20: logo + "Sözleşme & Mali · Taşeron Yönetimi")
 * UYGULAMA KABUĞUdur (F3 Topbar + Sidebar) — sayfa onu YENİDEN ÇİZMEZ. 19'daki
 * "+ Taşeron Ekle" butonu bu yüzden kabuğun üst şeridinden sayfa başlığının
 * aksiyon satırına iner (SZL'nin "+ Yeni Sözleşme" butonuyla AYNI karar).
 *
 * Üç kaynaklı istemci agregasyonunun tamamı `subcontractor-aggregate.ts`te —
 * bu bileşen yalnız sorguları bağlar, süzgeç state'ini tutar ve modalı açar.
 */
export function SubcontractorsView() {
  const subcontractorsQuery = useSubcontractors();
  const contractsQuery = useContracts({ type: "subcontractor" });
  // Kırpılma korkuluğu: şema tavanı AÇIKÇA gönderilir (varsayılan 50 sessizce
  // kırpardı), `total` ile eksiklik görünür kılınır.
  const paymentsQuery = useSubcontractorProgressPayments({
    limit: SUBCONTRACTOR_PAYMENT_LIST_MAX_LIMIT,
  });

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  // IZN-F5b · madde 7 — "+ Taşeron Ekle" = POST /subcontractors (taşeron firmaları ∪ sözleşmeler Düzenler).
  // Sayfa modeli yoksa bugünkü davranış (düğme görünür; sunucu karar verir).
  const canAddSubcontractor = useButtonGate({ pages: SUBCONTRACTOR_CREATE_EDIT, need: "edit", fallback: true });

  const paymentItems = useMemo(
    () => paymentsQuery.data?.items ?? [],
    [paymentsQuery.data],
  );
  const paymentTruncation = buildListTruncation(
    paymentItems.length,
    paymentsQuery.data?.total,
  );
  // M5_1 kayıt #339: hakediş ucu 403 verdiğinde de para kolonları PENDING'e
  // düşer (aşağıdaki `isPaymentTruncated`), ama gerekçesi "liste eksik" DEĞİL
  // "yetki yok"tur — ikisi karışmasın diye AYRI bir bayrak/metin taşınır.
  const isPaymentForbidden = isForbidden(paymentsQuery.error);
  const paymentPendingReason = isPaymentForbidden
    ? PAYMENT_FORBIDDEN_REASON
    : PAYMENT_PENDING_REASON;

  const directory = useMemo(() => {
    const now = new Date();
    return buildSubcontractorDirectory({
      subcontractors: subcontractorsQuery.data?.items ?? [],
      contracts: contractsQuery.data?.items ?? [],
      payments: paymentItems,
      // Hakediş ucunun KENDİSİ hata verdiyse elde liste hiç yoktur — türev
      // para değerleri yine PENDING'e düşer (sessiz 0 basılmaz).
      isPaymentTruncated: paymentTruncation.isTruncated || paymentsQuery.isError,
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
    });
  }, [
    subcontractorsQuery.data,
    contractsQuery.data,
    paymentItems,
    paymentTruncation.isTruncated,
    paymentsQuery.isError,
  ]);

  const visibleRows = useMemo(
    () => filterSubcontractorRows(directory.rows, { query, category }),
    [directory.rows, query, category],
  );

  if (isForbidden(subcontractorsQuery.error) || isForbidden(contractsQuery.error)) {
    return <AccessDenied />;
  }

  const isLoading = subcontractorsQuery.isLoading || contractsQuery.isLoading;
  const isError = subcontractorsQuery.isError || contractsQuery.isError;

  return (
    <div className="tl">
      <div className="tl__head">
        <div>
          <h1 className="tl__title">Taşeron Listesi</h1>
          {/* 24: "12 taşeron firma · 8 aktif sözleşme" — yüklenirken/hatalıyken
              sahte sıfır basılmaz (kalan-6 no 322). */}
          <div className="tl__subtitle">
            {isLoading || isError
              ? "Taşeron/sözleşme listesi yükleniyor…"
              : `${directory.summary.totalCount} taşeron firma · ${directory.summary.activeContractCount} aktif sözleşme`}
          </div>
        </div>
        <div className="tl__actions">
          {/* 26-29 · kutu içinde büyüteç + "Taşeron ara..." */}
          <Input
            className="tl__search"
            type="search"
            aria-label="Taşeron ara"
            placeholder="Taşeron ara..."
            leftIcon={<SearchIcon />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {/* 30 · seçenekler GERÇEK veriden; mockup'ın sabit üçlüsü artefakt. */}
          <Select
            aria-label="Kategori filtresi"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Tüm Kategoriler</option>
            {directory.categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          {/* 19 · kabuktan sayfa başlığına inen "+ Taşeron Ekle". */}
          {canAddSubcontractor && (
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              + Taşeron Ekle
            </Button>
          )}
        </div>
      </div>

      {paymentTruncation.isTruncated && (
        <p className="tl__notice" data-testid="tl-truncation-notice">
          {listTruncationMessage(paymentTruncation)} Ödenen / Bekleyen Hak. ve para
          KPI&apos;ları bu yüzden gösterilmiyor.
        </p>
      )}

      {/* M5_1 kayıt #339: 403 ayrı, görünür bir bantla anlatılır — "liste
          eksik" değil "yetki yok" gerçek sebep. */}
      {isPaymentForbidden && (
        <p className="tl__notice" data-testid="tl-payment-forbidden-notice">
          {PAYMENT_FORBIDDEN_REASON}. Ödenen / Bekleyen Hak. ve para KPI&apos;ları
          bu yüzden gösterilmiyor.
        </p>
      )}

      {directory.orphanContractCount > 0 && (
        <p className="tl__notice" data-testid="tl-orphan-notice">
          {directory.orphanContractCount} sözleşme listedeki hiçbir firmayla
          eşleşmedi — eşleştirme firma ADINA göre yapılır (liste uçları taşeron
          kimliği taşımaz).
        </p>
      )}

      {/* M5_1 kayıt #344: taslak yetim sözleşmeler AYRI bantla anlatılır —
          eskiden hiçbir sayaca girmiyor, sessizce yutuluyordu. */}
      {directory.orphanDraftContractCount > 0 && (
        <p className="tl__notice" data-testid="tl-orphan-draft-notice">
          {directory.orphanDraftContractCount} TASLAK sözleşme listedeki hiçbir
          firmayla eşleşmedi — eşleştirme firma ADINA göre yapılır (liste
          uçları taşeron kimliği taşımaz).
        </p>
      )}

      {/* Ad tekil değildir; aynı adı taşıyan iki firmada sözleşme HANGİSİNE ait
          olduğu söylenemez. Uydurulmuş bir satır basmak yerine sayılır. */}
      {directory.ambiguousContractCount > 0 && (
        <p className="tl__notice" data-testid="tl-ambiguous-notice">
          {directory.ambiguousContractCount} sözleşme AYNI ADI taşıyan birden
          çok firmaya uyduğu için hiçbir satıra yazılmadı — ayırt etmek için
          firma adlarını (ör. VKN ekleyerek) tekilleştirin.
        </p>
      )}

      <SubcontractorsSummaryStrip summary={directory.summary} isPending={isLoading || isError} />

      <SubcontractorsTable
        isError={isError}
        isLoading={isLoading}
        rows={isLoading || isError ? undefined : visibleRows}
        hasAnyRow={directory.rows.length > 0}
        paymentPendingReason={paymentPendingReason}
      />

      {isModalOpen && (
        <SubcontractorFormModal
          onClose={() => setIsModalOpen(false)}
          onCreated={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}
