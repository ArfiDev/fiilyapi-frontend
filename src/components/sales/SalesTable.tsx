import { Badge, Select } from "@/components/ui";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { WarningTriangleIcon, inlineSymbolProps } from "@/components/ui/icons";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { cx } from "@/lib/cx";
import { EMPTY_CELL, formatAmount } from "@/lib/format";

import {
  customerLine,
  filterSales,
  paymentPlanCell,
  saleRowTone,
  saleStatusBadge,
  SALES_STATUS_FILTER_ALL_LABEL,
  SALES_STATUS_FILTER_OPTIONS,
  type SaleRow,
  type SalesStatusFilter,
} from "./sales-labels";
import { resolveSalesTotals } from "./sales-totals";
import "./sales.css";

export interface SalesTableProps {
  /** `undefined` ⇒ yükleniyor/hata; mockup'ın örnek satırları SABİT BASILMAZ. */
  rows: SaleRow[] | undefined;
  /** Sunucunun SÜZÜLMEMİŞ toplamı (`UnitSaleListResponse.totals`). */
  serverTotals: Parameters<typeof resolveSalesTotals>[0]["serverTotals"];
  statusFilter: SalesStatusFilter | undefined;
  onStatusFilterChange: (filter: SalesStatusFilter | undefined) => void;
  isLoading: boolean;
  isError: boolean;
  /** Sunucunun Türkçe hata cümlesi — sabit cümle SON çaredir (ST §4b kanonu). */
  errorMessage?: string;
  /**
   * no 235 · `false` ⇒ proje seçilmemiş (`selectedProjectId === ""`), sorgular
   * `enabled:false`. `isLoading` bu durumda `false`dır (TanStack v5'te devre
   * dışı sorguda `isLoading` = `isPending && isFetching` → `isFetching` hiç
   * `true` olmaz) — bu yüzden ayrı bir hâl olarak taşınır, `isLoading`dan
   * TÜRETİLMEZ.
   */
  hasSelectedProject?: boolean;
  /** IZN-F4.2 · proje bağlamı: gizli alan kategorisi ekip rolünden okunur (`useProjectScopeId`); yoksa ana rol. */
  projectId?: string;
}

function emptyMessage(options: {
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isFiltered: boolean;
  hasSelectedProject: boolean;
}): { title: string; hint?: string } {
  if (!options.hasSelectedProject) return { title: "Önce bir proje seçin." };
  if (options.isLoading) return { title: "Satış listesi yükleniyor…" };
  if (options.isError) return { title: options.errorMessage ?? "Satış listesi yüklenemedi." };
  if (options.isFiltered) {
    return {
      title: "Bu durumla eşleşen satış yok.",
      hint: "Süzgeci “Tüm Durumlar”a alarak listenin tamamını görebilirsiniz.",
    };
  }
  return {
    title: "Bu projede henüz satış kaydı yok.",
    hint: "“+ Satış Kaydı” ile ilk satışı açın.",
  };
}

/**
 * SY 142-215 · "Satış Sözleşmeleri & Tahsilat" kartı: başlık + durum süzgeci
 * (144-147) · tablo (148-204) · TOPLAM satırı (205-213).
 *
 * ⚠️ SATIR DETAYA GİTMEZ (spec §2 / K3): satış DETAY ekranının mockup'ı YOKTUR;
 * satır bir bağlantı DEĞİLDİR ve durum aksiyonu (activate / transfer-deed /
 * cancel / pay) düğmesi HİÇ BASILMAZ. Mockup da satırda aksiyon çizmez.
 *
 * ⚠️ TOPLAM satırının kaynağı iki dallıdır — gerekçesi `sales-totals.ts`te.
 */
export function SalesTable({
  rows,
  serverTotals,
  statusFilter,
  onStatusFilterChange,
  isLoading,
  isError,
  errorMessage,
  hasSelectedProject = true,
  projectId,
}: SalesTableProps) {
  const isBuyerHidden = useCategoryHidden("satis_alici", projectId);
  const visibleRows = filterSales(rows ?? [], statusFilter);
  const isFiltered = statusFilter !== undefined;
  const totals = resolveSalesTotals({ visibleRows, serverTotals, isFiltered });
  const message =
    visibleRows.length === 0
      ? emptyMessage({ isLoading, isError, errorMessage, isFiltered, hasSelectedProject })
      : undefined;

  return (
    <section className="satis-card" aria-labelledby="satis-tablo-basligi">
      {/* 144-147 */}
      <div className="satis-card__head">
        <h2 className="satis-card__title" id="satis-tablo-basligi">
          Satış Sözleşmeleri &amp; Tahsilat
        </h2>
        {/* 146 — süzgeç İSTEMCİDE uygulanır (uç query parametresi ALMAZ) */}
        <Select
          size="row"
          aria-label="Durum filtresi"
          value={statusFilter ?? ""}
          onChange={(event) =>
            onStatusFilterChange(
              event.target.value === ""
                ? undefined
                : (event.target.value as SalesStatusFilter),
            )
          }
        >
          <option value="">{SALES_STATUS_FILTER_ALL_LABEL}</option>
          {SALES_STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <table className="satis-table">
        <thead>
          {/* 149-157 */}
          <tr>
            <th scope="col" className="satis-table__th satis-table__th--left">
              Ünite
            </th>
            <th scope="col" className="satis-table__th satis-table__th--left">
              Alıcı
            </th>
            <th scope="col" className="satis-table__th satis-table__th--right">
              Satış Bedeli
            </th>
            <th scope="col" className="satis-table__th satis-table__th--right satis-table__th--paid">
              Tahsil Edilen
            </th>
            <th
              scope="col"
              className="satis-table__th satis-table__th--right satis-table__th--remaining"
            >
              Kalan
            </th>
            <th scope="col" className="satis-table__th satis-table__th--center">
              Ödeme Planı
            </th>
            <th scope="col" className="satis-table__th satis-table__th--center">
              Durum
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const badge = saleStatusBadge(row);
            const plan = paymentPlanCell(row);
            const line = customerLine(row);
            const tone = saleRowTone(row);
            return (
              <tr
                key={row.id}
                className={cx("satis-row", tone !== "default" && `satis-row--${tone}`)}
                data-testid={`satis-row-${row.id}`}
              >
                {/* 160 */}
                <td className="satis-table__td satis-table__unit">{row.unit_label}</td>
                {/* 161 */}
                <td className="satis-table__td">
                  <div className="satis-table__customer">
                    {row.customer_name ?? EMPTY_CELL}
                    {row.customer_name === null && isBuyerHidden && <HiddenMark />}
                  </div>
                  {line && (
                    <div
                      className={cx("satis-table__note", `satis-table__note--${line.tone}`)}
                      data-icon={line.icon ?? "none"}
                    >
                      {line.icon === "warning" && (
                        <>
                          <WarningTriangleIcon {...inlineSymbolProps} />{" "}
                        </>
                      )}
                      {line.text}
                    </div>
                  )}
                </td>
                {/* 162 */}
                <td className="satis-table__td satis-table__td--right satis-table__td--mono satis-table__price">
                  {formatAmount(row.sale_price)}
                </td>
                {/* 163 */}
                <td className="satis-table__td satis-table__td--right satis-table__td--mono satis-table__paid">
                  {formatAmount(row.paid_amount)}
                </td>
                {/* 164 — kalan SIFIRSA soluk, aksi hâlde kehribar/kırmızı.
                    🔴 Maskeli (`null`) kalan SIFIR SAYILMAZ: `remaining_amount`
                    `Gorunurluk.para`dır ve `Number(null)` **0**'dır — ham okuma
                    gizlenmiş bir borcu "kapanmış" tonuyla boyardı. Tutarın
                    kendisi zaten "—" basılıyor; yanlış olan yanındaki İDDİAydı.
                    (`sales` matrisinde bugün `limited` hücre yok, yani kusur
                    LATENTtir — bir izin satırı değiştiğinde kod incelemesi
                    olmadan canlıya çıkardı.) */}
                <td
                  className={cx(
                    "satis-table__td satis-table__td--right satis-table__td--mono",
                    row.remaining_amount !== null && Number(row.remaining_amount) === 0
                      ? "satis-table__remaining--zero"
                      : tone === "overdue"
                        ? "satis-table__remaining--overdue"
                        : "satis-table__remaining",
                  )}
                >
                  {formatAmount(row.remaining_amount)}
                </td>
                {/* 165 */}
                <td className="satis-table__td satis-table__td--center">
                  <span
                    className={cx(
                      "satis-plan",
                      plan.isOverdue && "satis-plan--overdue",
                      plan.isMuted && "satis-plan--muted",
                    )}
                  >
                    {plan.text}
                  </span>
                </td>
                {/* 166 */}
                <td className="satis-table__td satis-table__td--center">
                  <Badge
                    variant={badge.variant}
                    className={cx("satis-badge", `satis-badge--${badge.modifier}`)}
                    data-testid={`satis-durum-${row.id}`}
                  >
                    {badge.label}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
        {totals !== undefined && visibleRows.length > 0 && (
          <tfoot>
            {/* 206-212 */}
            <tr className="satis-total" data-testid="satis-toplam">
              <td className="satis-total__label" colSpan={2}>
                TOPLAM ({totals.count} satış)
              </td>
              <td className="satis-total__value satis-total__value--price">
                {formatAmount(totals.salePriceTotal)}
              </td>
              <td className="satis-total__value satis-total__value--paid">
                {formatAmount(totals.paidTotal)}
              </td>
              <td className="satis-total__value satis-total__value--remaining">
                {formatAmount(totals.remainingTotal)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>

      {/* Süzgeç açıkken toplamın kaynağı DEĞİŞİR — kullanıcıya görünür yazılır. */}
      {totals?.isDerived === true && visibleRows.length > 0 && (
        <p className="satis-card__note" data-testid="satis-toplam-notu">
          TOPLAM satırı yalnızca süzgeçle görünen {totals.count} satışı sayar;
          projenin tamamı için süzgeci “Tüm Durumlar”a alın.
        </p>
      )}

      {message && (
        <div className="satis-empty" data-testid="satis-bos-durum">
          <p className="satis-empty__title">{message.title}</p>
          {message.hint && <p className="satis-empty__hint">{message.hint}</p>}
        </div>
      )}
    </section>
  );
}
