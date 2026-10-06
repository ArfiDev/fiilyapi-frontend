"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Badge, Button, Select } from "@/components/ui";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { EquipmentTabsStrip } from "@/components/equipment/EquipmentTabsStrip";
import {
  EQUIPMENT_RENTAL_INVOICES_MAX_LIMIT,
  useEquipmentRentalInvoices,
} from "@/lib/api/hooks/useEquipmentRentalInvoices";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import { isForbidden } from "@/lib/api/unwrap";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { EQUIPMENT_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EQUIPMENT_EDIT, EQUIPMENT_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import {
  buildListTruncation,
  listTruncationMessage,
} from "@/lib/list-truncation";
import {
  formatCurrencyPrecise,
  formatMonthName,
  formatPeriod,
} from "@/lib/format";

import {
  RENTAL_CREATE_FORM_PENDING_REASON,
  RENTAL_EMPTY_CELL,
  RENTAL_STATUS_BADGE,
  RATE_PERIOD_LABEL,
} from "./rental-labels";
import {
  RENTAL_STATUS_FILTER_OPTIONS,
  parseRentalFilters,
  withRentalFilterParams,
  type RentalFilterPatch,
} from "./rental-filters";
import { rentalSiteLabel } from "./rental-derive";
import "./equipment-rental.css";
import { routes } from "@/lib/routes";

const EQUIPMENT_PERMISSION_MODULE = "equipment";

/** Dönem seçicinin yıl aralığı — sunucu 2000-2200 kabul eder, ekran son beş yılı basar. */
const PERIOD_YEAR_SPAN = 5;

/**
 * F-KIRA · `/makine/kira` — kira hakedişi LİSTESİ.
 *
 * 🟡 ONAYLI SAPMA ADAYI (TASARIM-BRIEFI-2 madde 17): bu ekranın mockup'ı
 * YOKTUR. `Makine - Kira Hakedişi.dc.html` tek bir detay/doğrulama ekranı
 * çizer, ama `GET /equipment/rental-invoices` sayfalı bir liste döner ve
 * `EquipmentTabsStrip`teki "Kira Hakedişi" sekmesinin ineceği bir yer gerekir.
 * Yeni görsel dil ÜRETİLMEDİ: liste depodaki kanonik emsalden PORT edildi
 * (`SubcontractorProgressPaymentsView` — liste + süzgeç + kırpma bandı),
 * kabuk/CSS ad alanı `EquipmentWorkView` deseninden (`makine-*`).
 *
 * 🔴 KPI ŞERİDİ YOKTUR — emsalde var ama buraya PORT EDİLEMEZ: emsalin KPI'ı
 * ayrı bir `summary` ucundan (sunucu hesabı) gelir, kira listesinde öyle bir
 * uç YOKTUR ve liste satırı da toplam taşımaz (`list` uç açıklaması: "Satır
 * toplamları burada YOKTUR"). İstemcide `items` üzerinden toplansaydı `limit`
 * kırpılması o sayıyı sessizce YALAN yapardı.
 *
 * 🔴 ARAMA KUTUSU YOKTUR — uçta `q` parametresi yok (bkz. `rental-filters.ts`).
 */
export function EquipmentRentalInvoicesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseRentalFilters(
    new URLSearchParams(searchParams.toString()),
  );
  const { level, canWrite: moduleCanWrite } = useModulePermission(EQUIPMENT_PERMISSION_MODULE);
  const canViewEquipment = useButtonGate({ pages: EQUIPMENT_VIEW, need: "view", fallback: level !== "none" });
  // IZN-F2.x · kira hakedişi oluştur = saha.makine_* Düzenler (VEYA).
  const canWrite = useButtonGate({ pages: EQUIPMENT_EDIT, need: "edit", fallback: moduleCanWrite });

  // TB3 sayfalama kanonu: `limit` AÇIKÇA gönderilir (sunucu varsayılanı 50).
  const invoicesQuery = useEquipmentRentalInvoices({
    supplierId: filters.supplierId ?? undefined,
    siteId: filters.siteId ?? undefined,
    status: filters.status ?? undefined,
    periodYear: filters.periodYear ?? undefined,
    periodMonth: filters.periodMonth ?? undefined,
    limit: EQUIPMENT_RENTAL_INVOICES_MAX_LIMIT,
  });

  const suppliersQuery = useSuppliers({
    limit: EQUIPMENT_RENTAL_INVOICES_MAX_LIMIT,
  });
  const siteOptions = useSiteOptions();
  const isPaymentHidden = useCategoryHidden(EQUIPMENT_PAYMENT_HIDDEN_CATEGORIES);

  if (isForbidden(invoicesQuery.error)) return <AccessDenied />;

  const items = invoicesQuery.data?.items ?? [];
  const truncation = buildListTruncation(
    items.length,
    invoicesQuery.data?.total,
  );

  function pushParams(patch: RentalFilterPatch) {
    const next = withRentalFilterParams(
      new URLSearchParams(searchParams.toString()),
      patch,
    );
    const query = next.toString();
    // Boş sorgu dizesinde üretici "?" bile eklemez — ayrı bir dal GEREKMEZ.
    router.push(routes.equipment.rentalInvoices(query));
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: PERIOD_YEAR_SPAN },
    (_, index) => currentYear - index,
  );

  return (
    <div className="makine-kira">
      <div className="makine-kira__title-row">
        <h1 className="makine-kira__title">Kira Hakedişi</h1>
        {canWrite && (
          // 🔴 UÇ AÇIK AMA FORM MOCKUP'I YOK → form İCAT EDİLMEZ (F-MK T4
          // `+ Kayıt Ekle` emsali, `work-labels.ts:5-7`). Öğe SİLİNMEZ,
          // devre-dışı + GÖRÜNÜR gerekçeyle basılır (F-TH kalıcı kuralı).
          <Button
            variant="primary"
            disabled
            title={RENTAL_CREATE_FORM_PENDING_REASON}
            aria-describedby="makine-kira-create-reason"
            data-testid="makine-kira-create"
          >
            + Yeni Kira Hakedişi
          </Button>
        )}
      </div>

      <EquipmentTabsStrip activeTab="Kira Hakedişi" />

      {canWrite && (
        <p id="makine-kira-create-reason" className="makine-kira__reason">
          {RENTAL_CREATE_FORM_PENDING_REASON}
        </p>
      )}

      <div className="makine-kira__filters" role="group" aria-label="Süzgeçler">
        <Select
          aria-label="Dönem yılı"
          value={filters.periodYear ?? ""}
          data-testid="makine-kira-filter-year"
          onChange={(event) =>
            pushParams({
              period_year: event.target.value
                ? Number(event.target.value)
                : null,
            })
          }
        >
          <option value="">Tüm Yıllar</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Dönem ayı"
          value={filters.periodMonth ?? ""}
          data-testid="makine-kira-filter-month"
          onChange={(event) =>
            pushParams({
              period_month: event.target.value
                ? Number(event.target.value)
                : null,
            })
          }
        >
          <option value="">Tüm Aylar</option>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
            <option key={month} value={month}>
              {formatMonthName(month)}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Kiralama Firması"
          value={filters.supplierId ?? ""}
          data-testid="makine-kira-filter-supplier"
          onChange={(event) =>
            pushParams({ supplier_id: event.target.value || null })
          }
        >
          <option value="">Tüm Firmalar</option>
          {(suppliersQuery.data?.items ?? []).map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Şantiye"
          value={filters.siteId ?? ""}
          data-testid="makine-kira-filter-site"
          onChange={(event) =>
            pushParams({ site_id: event.target.value || null })
          }
        >
          <option value="">Tüm Şantiyeler</option>
          {siteOptions.options.map((option) => (
            <option key={option.siteId} value={option.siteId}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Durum"
          value={filters.status ?? ""}
          data-testid="makine-kira-filter-status"
          onChange={(event) =>
            pushParams({ status: event.target.value || null })
          }
        >
          <option value="">Tüm Durumlar</option>
          {RENTAL_STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Yüklendi işaretleri — görsel spec'in durum-tabanlı iddiaları bunlara bakar. */}
      {invoicesQuery.isSuccess && (
        <span hidden data-testid="makine-kira-loaded-list" />
      )}
      {suppliersQuery.isSuccess && (
        <span hidden data-testid="makine-kira-loaded-suppliers" />
      )}
      {!siteOptions.isLoading && !siteOptions.isError && (
        <span hidden data-testid="makine-kira-loaded-sites" />
      )}

      <div className="makine-kira__panel">
        <table className="makine-kira__table">
          <thead>
            <tr>
              <th scope="col">Dönem</th>
              <th scope="col">Kiralama Firması</th>
              <th scope="col">Fatura No</th>
              <th scope="col">Şantiye</th>
              <th scope="col">Kira Tipi</th>
              <th scope="col" className="makine-kira__num">
                Ödenecek
                <MaskedMark isHidden={isPaymentHidden} values={items.map((invoice) => invoice.payable_total)} />
              </th>
              <th scope="col">Durum</th>
            </tr>
          </thead>
          <tbody>
            {invoicesQuery.isLoading && (
              <tr>
                <td colSpan={7} className="makine-kira__empty">
                  Yükleniyor…
                </td>
              </tr>
            )}
            {invoicesQuery.isError && !isForbidden(invoicesQuery.error) && (
              <tr>
                <td colSpan={7} className="makine-kira__empty">
                  Kira hakedişleri yüklenemedi.
                </td>
              </tr>
            )}
            {invoicesQuery.isSuccess && items.length === 0 && (
              <tr>
                <td colSpan={7} className="makine-kira__empty">
                  Bu süzgeçlerle kira hakedişi bulunamadı.
                </td>
              </tr>
            )}
            {items.map((invoice) => {
              const badge = RENTAL_STATUS_BADGE[invoice.status];
              return (
                <tr key={invoice.id} data-rental-invoice-id={invoice.id}>
                  <td>
                    <Link
                      className="makine-kira__link"
                      href={routes.equipment.rentalInvoiceDetail({
                        invoiceId: invoice.id,
                      })}
                    >
                      {formatPeriod(invoice.period_year, invoice.period_month)}
                    </Link>
                  </td>
                  <td>{invoice.supplier_name ?? RENTAL_EMPTY_CELL}</td>
                  <td className="makine-kira__mono">
                    {invoice.invoice_no ?? RENTAL_EMPTY_CELL}
                  </td>
                  <td>{rentalSiteLabel(invoice.site_name)}</td>
                  <td>{RATE_PERIOD_LABEL[invoice.rate_period]}</td>
                  <td className="makine-kira__num makine-kira__mono">
                    {/* 🔴 K9: ekran KDV'yi YENİDEN HESAPLAMAZ. `payable_total`
                        null ise (fatura tutarı henüz girilmemiş) uydurma bir
                        sayı basmak yerine boş işareti basılır. */}
                    {invoice.payable_total === null
                      ? RENTAL_EMPTY_CELL
                      : formatCurrencyPrecise(invoice.payable_total)}
                  </td>
                  <td>
                    <Badge
                      variant={badge.variant}
                      data-testid="makine-kira-status"
                    >
                      {badge.label}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {truncation.isTruncated && (
        <p
          className="makine-kira__limit-note"
          data-testid="makine-kira-limit-note"
        >
          {listTruncationMessage(truncation)}
        </p>
      )}

      {/* İzin seviyesi bilinmiyorsa gizleme yapılmaz (permissions bilinmezlik
          kuralı); `level` yalnız yazma düğmesinin kapısıdır. */}
      {!canViewEquipment && <span hidden data-testid="makine-kira-readonly" />}
    </div>
  );
}
