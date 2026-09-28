import Link from "next/link";

import { NAV_GROUPS } from "@/components/shell/nav-config";
import { Button, Select } from "@/components/ui";
import { pendingModuleLabel } from "@/lib/pending-modules";

import {
  EXPORT_DISABLED_REASON,
  REPORT_CATEGORIES,
  isLinkedRow,
  type ReportCategory,
  type ReportRow,
} from "./reports-catalog";
import "./reports.css";

/**
 * F-RAPOR T2 · `/raporlar` — mockup `projedesign/Raporlar.dc.html` (R<n> =
 * o dosyanın satır numarası).
 *
 * 🔴 EKRAN SALT-OKURDUR ve hiçbir uca ÇAĞRI YAPMAZ: katalog statik veridir
 * (`reports-catalog.ts`). Bu yüzden yükleme/hata dalı, `useModulePermission`
 * ve `AccessDenied` YOKTUR — korunacak bir veri yok, korunan şey HEDEF
 * ekranların kendisidir (kabuk nav'ıyla aynı davranış).
 *
 * 🔴 R59 "Genel" bir KIRINTI DEĞİLDİR — kabuk nav'ının GRUP BAŞLIĞIdır
 * (`NAV_GROUPS[0].heading`) ve ekranlar onu sayfa içi "eyebrow" olarak basar
 * (`stok__eyebrow` · `fs__eyebrow` emsali). Metin KOPYALANMAZ, nav'dan TÜRER:
 * grup yeniden adlandırılırsa bu satır kendiliğinden ona uyar. Gerçek kırıntı
 * zaten kabuk düzeyinde `<main>`in üstünde basılır (SEKME-F1.2,
 * `PageBreadcrumb`) — ikinci kez BASILMAZ.
 */
export function ReportsCatalogView() {
  return (
    <div className="rap">
      <p className="rap__eyebrow">{NAV_GROUPS[0].heading}</p>

      {/* R60-63 */}
      <div className="rap__head">
        <h1 className="rap__title">Raporlar</h1>
        {/* 🔴 R62 · proje süzgeci — ÖLÇÜLDÜ ve DEVRE DIŞI basıldı (F-TH
            kanonu: mockup öğesi silinmez). Katalogdaki 5 etkin satırın
            hedeflerinin HİÇBİRİ proje parametresi almaz; gelir tablosu ucu
            `project_id` bile taşımaz (`financial_statements_project_filter`).
            Süzgeci çalışır basmak, seçimin hiçbir şeyi değiştirmediği bir
            kontrol olurdu. Ham `<select>` YASAK — `ui` primitive'i.
            Mockup'ın ikinci seçeneği (`Güneşkent A-Blok`) BASILMAZ: karşılığı
            olmayan bir vaat olurdu (E11 emsali). */}
        <Select
          size="row"
          disabled
          defaultValue="all"
          aria-label="Proje süzgeci"
          data-testid="rap-project-filter"
        >
          <option value="all">Tüm Projeler</option>
        </Select>
      </div>

      <p className="rap__notice" data-testid="rap-project-filter-reason">
        “Proje süzgeci”: {pendingModuleLabel("financial_statements_project_filter")}.
      </p>

      {/* R77-80 vb. — biçim çiplerinin ORTAK gerekçesi. 14 satırın her birine
          aynı cümleyi basmak yerine bir kez yazılır: boşluk TEKtir (dışa
          aktarma ucu hiç açılmadı), 14 ayrı boşluk değil. */}
      <p className="rap__notice" data-testid="rap-export-reason">
        “XLS” / “PDF”: {EXPORT_DISABLED_REASON}.
      </p>

      {/* R66 — iki sütunlu ızgara. */}
      <div className="rap__grid" data-testid="rap-grid">
        {REPORT_CATEGORIES.map((category) => (
          <ReportCategoryCard key={category.key} category={category} />
        ))}
      </div>
    </div>
  );
}

/** R69-104 — bir kategori kartı. */
function ReportCategoryCard({ category }: { category: ReportCategory }) {
  return (
    <section className="rap-card" data-testid={`rap-card-${category.key}`}>
      {/* R70-73 */}
      <header className="rap-card__head">
        <span className="rap-card__icon" aria-hidden="true">
          {category.icon}
        </span>
        <span className="rap-card__heading">
          <h2 className="rap-card__title">{category.title}</h2>
          <span className="rap-card__subtitle">{category.subtitle}</span>
        </span>
      </header>

      <ul className="rap-card__list">
        {category.rows.map((row) => (
          <li key={row.key} className="rap-row" data-testid={`rap-row-${row.key}`}>
            <ReportRowBody row={row} />
            {/* R77-80 — biçim çipleri. Ortak gerekçe başlıkta basıldığı için
                burada TEKRARLANMAZ; düğmenin kendisi `disabled`dır. */}
            <span className="rap-row__formats">
              {row.formats.map((format) => (
                <Button
                  key={format}
                  variant="secondary"
                  size="sm"
                  disabled
                  data-testid={`rap-${row.key}-${format.toLowerCase()}`}
                >
                  {format}
                </Button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Satırın İKİ hâli. Etkin satır bir `Link`tir; devre dışı satır bağlantı
 * DEĞİLDİR (tıklanacak bir şey basılmaz) ve gerekçesini GÖRÜNÜR basar.
 *
 * 🔴 Devre dışı satır `<a aria-disabled>` olarak BASILMAZ: `aria-disabled`
 * bağlantıyı gezinmeden alıkoymaz, klavye kullanıcısı yine hedefe düşerdi.
 */
function ReportRowBody({ row }: { row: ReportRow }) {
  if (isLinkedRow(row)) {
    return (
      <Link className="rap-row__main rap-row__main--linked" href={row.href}>
        <span className="rap-row__title">{row.title}</span>
        <span className="rap-row__subtitle">{row.subtitle}</span>
      </Link>
    );
  }
  return (
    <span className="rap-row__main rap-row__main--pending">
      <span className="rap-row__title">{row.title}</span>
      <span className="rap-row__subtitle">{row.subtitle}</span>
      <span className="rap-row__reason" data-testid={`rap-${row.key}-reason`}>
        {row.reason}
      </span>
    </span>
  );
}
