"use client";

import { useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  FINANCIAL_INSTRUMENT_LIST_MAX_LIMIT,
  useFinancialInstruments,
  useFinancialInstrumentSummary,
} from "@/lib/api/hooks/useFinancialInstruments";
import { isForbidden } from "@/lib/api/unwrap";
import { TREASURY_EDIT, TREASURY_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { InstrumentFormModal } from "./InstrumentFormModal";
import { InstrumentSummaryCards } from "./InstrumentSummaryCards";
import { InstrumentsTable } from "./InstrumentsTable";
import {
  INSTRUMENT_TABS,
  instrumentSerialColumnLabel,
  instrumentTabFilter,
  instrumentTabFromParam,
} from "./financial-instrument-labels";
import "./financial-instruments.css";

const TAB_PARAM = "sekme";

/**
 * 🟢 **F-CEK · ONAYLI SAPMA KAPANDI.** E10:65 "+ Çek Ekle" bir tur boyunca
 * DEVRE DIŞI basıldı: uç vardı (`POST /financial-instruments`) ama formun
 * mockup'ı ÇİZİLMEMİŞTİ ve kanon *"rotası/mockup'ı olmayan öğe SİLİNMEZ,
 * devre dışı basılır"* der — uydurma form açılmaz.
 *
 * Mockup artık VARDIR (`projedesign/Form - Cek Ekle.dc.html`) → düğme AÇILDI,
 * gerekçe bandı KALDIRILDI. 🔑 Gerekçe metnini ekranda BIRAKMAK, canlı bir
 * düğmeyi YALANLARDI (F-KIRA/F-PRJTAB kanonu).
 *
 * 🔴 Yazma izni AYRI bir kapıdır: `treasury` modülünde yalnız okuma yetkisi
 * olan kullanıcı listeyi görür ama kayıt AÇAMAZ (fail-closed değil, çünkü
 * `canWrite` bilinmezlikte `true`dur — kanon §2.5.3).
 */
const ADD_FORBIDDEN_HINT = "Çek/senet eklemek için yazma yetkiniz yok.";

/**
 * F-FIN · `/hazine/cek-senet` — mockup `Ekran 10 - Finans Çek Ödeme.dc.html`
 * (E10, kanonik). Yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın KENDİ üst barı (E10:20-33) ve sol menüsü (E10:36-59) BASILMAZ:
 * kabuk canon kazanır (F3 Topbar + Sidebar).
 *
 * ⚠️ İKİ BAĞIMSIZ VERİ KAYNAĞI: özet kartları (`/summary`) ve liste
 * (`/financial-instruments`). Her biri KENDİ yükleme/hata yolunu işletir —
 * biri patlayınca öteki yaşamaya devam eder.
 *
 * ⚠️ SEKME SÜZGECİ SUNUCUYA GİDER; istemcide süzülen hiçbir şey YOKTUR, aksi
 * hâlde sayfalanan kümenin dışındaki kayıtlar sessizce kaybolurdu.
 */
export function FinancialInstrumentsView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canViewTreasury = useButtonGate({ pages: TREASURY_VIEW, need: "view" });
  // IZN-F2.x · çek ekle = mali.hazine/mali.cek_odeme Düzenler (VEYA).
  const canAddInstrument = useButtonGate({ pages: TREASURY_EDIT, need: "edit" });

  const tab = instrumentTabFromParam(searchParams.get(TAB_PARAM));
  const [isFormOpen, setFormOpen] = useState(false);

  const summaryQuery = useFinancialInstrumentSummary();
  // Kırpma korkuluğu (TB3/F-TH): tavan AÇIKÇA gönderilir, eksik kalan kayıt
  // `total` üzerinden GÖRÜNÜR bir bantla bildirilir — sessizce kırpılmaz.
  // 🔴 E10 sayfalama çubuğu ÇİZMEZ (mockup kazanır, K5) — bu yüzden çubuk
  // EKLENMEDİ; tavanı aşan portföy bandı görür.
  const listQuery = useFinancialInstruments({
    ...instrumentTabFilter(tab),
    limit: FINANCIAL_INSTRUMENT_LIST_MAX_LIMIT,
  });

  if (!canViewTreasury || isForbidden(listQuery.error) || isForbidden(summaryQuery.error)) {
    return <AccessDenied />;
  }

  const rows = listQuery.data?.items;
  const truncation = buildListTruncation(rows?.length ?? 0, listQuery.data?.total);

  function selectTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "alinan") params.delete(TAB_PARAM);
    else params.set(TAB_PARAM, next);
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="fin">
      {/* E10:62 */}
      <p className="fin__eyebrow">Hazine · Çek &amp; Senet Yönetimi</p>

      {/* E10:63-66 */}
      <div className="fin__head">
        <h1 className="fin__title">Çek &amp; Ödeme</h1>
        {/* E10:65 — CANLI. Yetkisiz kullanıcıda devre dışı kalır ve gerekçe
            hem `title` hem `sr-only` ile taşınır (F-HZ emsali). */}
        <Button
          variant="primary"
          disabled={!canAddInstrument}
          {...(canAddInstrument ? {} : { title: ADD_FORBIDDEN_HINT })}
          onClick={() => setFormOpen(true)}
          data-testid="fin-add"
        >
          + Çek Ekle
          {!canAddInstrument && <span className="sr-only"> — {ADD_FORBIDDEN_HINT}</span>}
        </Button>
      </div>

      {/* E10:69-90 — dört kart, kendi hata yolu. */}
      {summaryQuery.isError && (
        <p className="fin-notice fin-notice--danger" data-testid="fin-summary-error">
          {backendErrorMessage(summaryQuery.error, "Özet kartları yüklenemedi.")}
        </p>
      )}
      <InstrumentSummaryCards summary={summaryQuery.data} />

      {/* E10:93-97 — ÜÇ sekme; ayrı uç DEĞİL, süzgeç. */}
      <div className="fin-tabs" role="tablist" aria-label="Kıymetli evrak sekmeleri">
        {INSTRUMENT_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className="fin-tab"
            aria-current={tab === item.key ? "page" : undefined}
            data-testid={`fin-tab-${item.key}`}
            onClick={() => selectTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* E10:99-161 */}
      {truncation.isTruncated && (
        <p className="fin-notice" data-testid="fin-truncation">
          {listTruncationMessage(truncation)}
        </p>
      )}
      <InstrumentsTable
        rows={rows}
        serialColumnLabel={instrumentSerialColumnLabel(tab)}
        isLoading={listQuery.isLoading}
        errorMessage={
          listQuery.isError
            ? backendErrorMessage(listQuery.error, "Çek/senet listesi yüklenemedi.")
            : undefined
        }
      />

      {/* Görsel spec "yüklendi" iddiasını KAYNAK BAŞINA kurar — tek bayrak
          ikinci kaynağın hâlâ pending olduğunu GİZLERDİ (F-İK dersi). */}
      {summaryQuery.data !== undefined && <span hidden data-testid="fin-loaded-summary" />}
      {listQuery.data !== undefined && <span hidden data-testid="fin-loaded-list" />}

      {/* FCE:70 — form MODALDIR, ayrı sayfa değil (KARAR 1). */}
      {isFormOpen && (
        <InstrumentFormModal onClose={() => setFormOpen(false)} />
      )}
    </div>
  );
}
