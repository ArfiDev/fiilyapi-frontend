import type { WorkItemRead } from "@/lib/api/models";
import type { OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";
import { EMPTY_CELL, formatDateDots, formatFixedDecimal, formatMoneyTl, parseUtcOrOffsetTimestamp, toIstanbulDateOnly } from "@/lib/format";
import { toDecimalString } from "@/lib/decimal";

/** TKL-F4.5 · şablon ekranının SAF görünüm yardımcıları (arama, seçim, tarih, katalog birleşimi). */

const LOCALE = "tr-TR";
const LETTERS = 26;
const FIRST_LETTER_CODE = 65;
const AS_FRACTION_DIGITS = 2;

/** TS:314-315: arama `tr-TR` küçük harfle, ad üzerinde; boş arama süzmez. */
export function searchTemplates(items: readonly OfferTemplateListItem[], query: string): OfferTemplateListItem[] {
  const needle = query.trim().toLocaleLowerCase(LOCALE);
  if (needle === "") return [...items];
  return items.filter((item) => item.name.toLocaleLowerCase(LOCALE).includes(needle));
}

/** "Güncelleme GG.AA.YYYY" — İstanbul takvim günü (UTC 21:00 sonrası ertesi gündür). */
export function formatUpdatedDate(updatedAt: string): string {
  return formatDateDots(toIstanbulDateOnly(parseUtcOrOffsetTimestamp(updatedAt).toISOString()));
}

/** ÜS-F4-2: URL'deki kimlik listedeyse o; yoksa ilk şablon (varsayılan önce sıralı gelir). */
export function resolveSelectedId(items: readonly OfferTemplateListItem[], param: string | null): string | null {
  if (param !== null && items.some((item) => item.id === param)) return param;
  return items[0]?.id ?? null;
}

/** Grup kod harfi = sıra: A…Z, sonra AA, AB… */
export function groupCode(index: number): string {
  const letter = String.fromCharCode(FIRST_LETTER_CODE + (index % LETTERS));
  return index < LETTERS ? letter : `${groupCode(Math.floor(index / LETTERS) - 1)}${letter}`;
}

export type CatalogPriceCell = { kind: "price" | "ref" | "none"; text: string };

/** "Katalog son fiyat": son fiyat → gri "Ref ₺…" → "—" (T38 sırası; maskeli/bulunamayan "—"). */
export function catalogPriceCell(item: WorkItemRead | undefined): CatalogPriceCell {
  const last = item?.last_price?.price;
  if (last !== undefined && last !== null) return { kind: "price", text: formatMoneyTl(last) };
  const ref = item?.ref_price;
  if (ref !== undefined && ref !== null) return { kind: "ref", text: `Ref ${formatMoneyTl(ref)}` };
  return { kind: "none", text: EMPTY_CELL };
}

/** "A-s / birim" (`standard_unit_mhr`), mockup `nf(v,2)`. */
export function formatAsPerUnit(item: WorkItemRead | undefined): string {
  const decimal = item === undefined ? null : toDecimalString(item.standard_unit_mhr);
  return decimal === null ? EMPTY_CELL : formatFixedDecimal(decimal, AS_FRACTION_DIGITS);
}
