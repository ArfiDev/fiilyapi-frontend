import { Input } from "@/components/ui";
import { SourceCodeSub } from "@/components/catalog-shared/SourceCodeSub";
import { formatAmount, formatQuantity } from "@/lib/format";
import type { ContractDistributionSite } from "@/lib/api/hooks/useContract";

import { sanitizeTrDecimalInput, formatTrQuantityText } from "./tr-quantity";
import { cellKey, rowAmountTotal, rowQuantityTotal, type PivotRow } from "./pivot";
import { isDiarySourced } from "./quantity-source";

/** 11 basamak + 3 binlik nokta + virgül + 3 ondalık. */
const QUANTITY_INPUT_MAX_LENGTH = 18;

export interface PaymentFormPivotTableProps {
  sites: ContractDistributionSite[];
  rows: PivotRow[];
  disabled: boolean;
  /** Hatalı hücreler: `cellKey(kalem, şantiye)` → görünür mesaj (kayıt denemesinde dolar). */
  cellErrors?: Readonly<Record<string, string>>;
  onQuantityChange: (itemId: string, siteId: string, value: string) => void;
}

// E "İşveren Hakediş Oluştur" mockup 88-200 — şantiye bazlı miktar tablosu.
// Sözleşme kalemi = satır, şantiye = sütun (brief §Veri kaynakları). Mockup'ın
// "FF Katsayı" + "Düz. B.F." sütunları (mockup 101-102, 121, 136...) BURADA
// YOK: brief §Form üst bölümü katsayıyı yalnız hakediş BAŞLIĞI seviyesinde
// (`default_coefficient`) tanımlıyor, satır bazlı katsayı girişi istemiyor —
// `ProgressPaymentLineInput.coefficient` gönderilmezse backend yeni satıra
// başlığın varsayılanını uygular, var olanı DEĞİŞTİRMEZ (şema açıklaması).
// "Hakediş Tutarı" sütunu da mockup'taki gibi anlık çarpımla (birim fiyat ×
// miktar × katsayı) HESAPLANMAZ — float/çarpma riski (brief §tfoot: yalnız
// backend'in zaten hesapladığı `line_total` toplanır, `sumDecimalStrings`
// ile). Hiç kaydedilmemiş hücrede bu yüzden "—" basılır.
export function PaymentFormPivotTable({
  sites,
  rows,
  disabled,
  cellErrors = {},
  onQuantityChange,
}: PaymentFormPivotTableProps) {
  return (
    <section className="pp-table-card">
      <div className="pp-table-card__head">
        <span>Hakediş Kalemleri — Şantiye Bazlı</span>
        <span className="pp-form-table__head-note">
          Birim fiyatlar sözleşmeden gelir · değiştirilemez
        </span>
      </div>
      <div className="pp-form-table__scroll">
        <table className="pp-table pp-form-table">
          <thead>
            <tr>
              <th className="pp-table__th pp-table__col--item">Poz No</th>
              <th className="pp-table__th pp-table__col--item">Poz Adı</th>
              <th className="pp-table__th">Birim</th>
              <th className="pp-table__th">Sözl. B.F. 🔒</th>
              {sites.map((site) => (
                <th key={site.id} className="pp-table__th">
                  {site.name}
                </th>
              ))}
              <th className="pp-table__th">Toplam</th>
              <th className="pp-table__th">Hakediş Tutarı</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const previousGroup = index > 0 ? rows[index - 1].groupName : null;
              const showGroupHeader = row.groupName !== previousGroup;
              // Tek çağrı: `rowAmountTotal` iki kez çağrılıp `!` ile
              // daraltmak yerine (final inceleme #6) sonuç bir kez hesaplanır.
              const amountTotal = rowAmountTotal(row);
              // Mockup 117: poz adının altındaki "📅 Günlük kayıtlardan
              // hesaplandı" notu — satırın EN AZ BİR hücresi SUNUCUDA `diary`
              // damgalıysa basılır (F-P10 T2: oturum-içi türetme kalktı).
              const isDiaryFilled = row.cells.some((cell) => isDiarySourced(cell.quantitySource));
              return (
                <PivotRowGroup key={row.item.id}>
                  {showGroupHeader && (
                    <tr className="pp-form-table__group-row">
                      <td colSpan={4 + sites.length + 2}>{row.groupName}</td>
                    </tr>
                  )}
                  <tr className="pp-table__row">
                    <td className="pp-table__cell pp-table__col--item">
                      {row.item.code}
                      <SourceCodeSub code={row.sourceCode} data-testid="pp-form-source-code" />
                    </td>
                    <td className="pp-table__cell pp-table__col--item">
                      {row.item.description}
                      {isDiaryFilled && (
                        <span className="pp-form-table__diary-note" data-testid="pp-form-diary-note">
                          📅 Günlük kayıtlardan hesaplandı
                        </span>
                      )}
                    </td>
                    <td className="pp-table__cell">{row.item.unit}</td>
                    <td className="pp-table__cell">{formatAmount(row.item.unit_price)}</td>
                    {row.cells.map((cell) => (
                      <td key={cell.siteId} className="pp-table__cell pp-form-table__qty-cell">
                        {cell.editable ? (
                          <>
                            <Input
                              size="row"
                              numeric
                              inputMode="decimal"
                              maxLength={QUANTITY_INPUT_MAX_LENGTH}
                              aria-label={`${row.item.description} — ${
                                sites.find((s) => s.id === cell.siteId)?.name ?? ""
                              } miktar`}
                              aria-invalid={cellErrors[cellKey(row.item.id, cell.siteId)] ? true : undefined}
                              value={cell.quantity}
                              disabled={disabled}
                              onChange={(event) =>
                                // Hücre durumu EKRAN METNİDİR (Türkçe): yalnız rakam, nokta ve tek
                                // virgül girer; "12," gibi geçici ara haller serbesttir — okuma ve
                                // hata kaydetmede (`normalizePivotRowsForSave`).
                                onQuantityChange(
                                  row.item.id,
                                  cell.siteId,
                                  sanitizeTrDecimalInput(event.target.value),
                                )
                              }
                            />
                            {cellErrors[cellKey(row.item.id, cell.siteId)] && (
                              <span className="pp-form-table__qty-error" data-testid="pp-form-qty-error">
                                {cellErrors[cellKey(row.item.id, cell.siteId)]}
                              </span>
                            )}
                          </>
                        ) : (
                          // FİNAL İNCELEME düzeltmesi #2: hücre kilitli AMA
                          // sunucuda kayıtlı bir miktar taşıyorsa (tahsisi
                          // SONRADAN kaldırılmış satır) sabit "—" yerine o
                          // miktar basılır — aksi halde kullanıcı "Taslak
                          // Kaydet"e basınca sessizce sileceği veriyi hiç
                          // görmez (bkz. `findOrphanedAllocationCells`).
                          <span
                            className="pp-form-table__locked-cell"
                            title={
                              cell.isSaved
                                ? "Bu pozun bu şantiyeye tahsisi kaldırıldı; kaydedince bu miktar SİLİNECEK."
                                : "Bu poz seçilen şantiyeye dağıtılmadı; önce poz dağılımını yapın."
                            }
                          >
                            {cell.isSaved ? formatTrQuantityText(cell.quantity) : "—"}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="pp-table__cell pp-table__cell--total">
                      {formatQuantity(rowQuantityTotal(row))}
                    </td>
                    <td className="pp-table__cell pp-table__cell--total">
                      {amountTotal !== null ? formatAmount(amountTotal) : "—"}
                    </td>
                  </tr>
                </PivotRowGroup>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// `<tbody>` içine yalnız `<tr>` konabildiğinden grup başlığı + kalem satırı
// bir Fragment ile birlikte döner — ekstra sarmalayıcı DOM elemanı eklemez.
function PivotRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
