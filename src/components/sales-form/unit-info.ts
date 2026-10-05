/**
 * F-P8 T3 · "Satılan Ünite" bilgi kutuları (58-63) ve "Bu Satıştan Kâr" (89-92)
 * için SAF türevler.
 *
 * ⚠️ HİÇBİR MALİYET İSTEMCİDE UYDURULMAZ. Ünite maliyeti P10'dan gelir:
 * `UnitResponse.unit_cost` bir `MetricPlaceholder` zarfıdır (`available` +
 * `value`). Zarf `available:false` iken maliyet ve dolayısıyla kâr "—" basılır.
 *
 * "Bu Satıştan Kâr" (89-92) mockup'ın kendi alt satırında yazdığı gibi
 * "Satış bedeli − ünite maliyeti"dir: satış bedeli KULLANICININ girdisidir,
 * maliyet SUNUCUNUNdur. İstemci yalnız bu iki GERÇEK değeri çıkarır; maliyeti
 * kendisi HESAPLAMAZ (kayıt: sunucuda ayrı bir `sale_profit` alanı da vardır ama
 * o SATIŞ oluştuktan SONRA anlamlıdır — form aşamasında satış henüz yoktur, bu
 * yüzden form kartı `unit_cost` + kullanıcı bedeli üzerinden türetir).
 */

import type { UnitResponse } from "@/lib/api/hooks/useProjectUnits";
import { formatAmount } from "@/lib/format";
import { isRestrictedEnvelope } from "@/lib/placeholder-cell";

export interface UnitCostInfo {
  available: boolean;
  /** Biçimlenmiş maliyet ("₺" içermez; kart kendi sembolünü basar) veya null. */
  text: string | null;
  /** Ham sunucu değeri (kâr türevi için) veya null — istemci hesaplamaz. */
  rawValue: number | null;
  /** Sunucunun bildirdiği eksik modül (varsa) — gerekçe gösterimi için. */
  pendingModule: string | null;
  /** IZN-F4.2 · zarfın 3. hâli (rolün izni yok): kart "—" + kilit + "Bu bilgi rolünüz için gizli". */
  isRestricted: boolean;
}

export interface UnitInfoBoxes {
  /** "178 / 152" — brüt/net m² (59). */
  grossNet: string | null;
  /** Biçimlenmiş liste fiyatı (60) veya null. */
  listPrice: string | null;
  /** m² birim fiyatı (61) — sunucunun `unit_price_per_m2` alanı. */
  pricePerM2: string | null;
  cost: UnitCostInfo;
}

export function deriveUnitCost(unit: UnitResponse): UnitCostInfo {
  const metric = unit.unit_cost;
  if (!metric.available || metric.value === null || metric.value === undefined) {
    return {
      available: false,
      text: null,
      rawValue: null,
      pendingModule: metric.pending_module ?? null,
      isRestricted: isRestrictedEnvelope(metric),
    };
  }
  return {
    available: true,
    text: formatAmount(metric.value),
    rawValue: Number(metric.value),
    pendingModule: null,
    isRestricted: false,
  };
}

export function deriveUnitInfoBoxes(unit: UnitResponse): UnitInfoBoxes {
  const gross = unit.gross_area_m2;
  const net = unit.net_area_m2;
  const grossNet =
    gross === null && net === null
      ? null
      : `${gross === null ? "—" : formatAmount(gross)} / ${net === null ? "—" : formatAmount(net)}`;
  return {
    grossNet,
    listPrice: unit.list_price === null ? null : formatAmount(unit.list_price),
    pricePerM2: unit.unit_price_per_m2 === null ? null : formatAmount(unit.unit_price_per_m2),
    cost: deriveUnitCost(unit),
  };
}

export interface SaleProfit {
  /** Maliyet + geçerli bedel varsa hesaplanabilir. */
  available: boolean;
  /** Kâr tutarı (₺ sembolsüz biçimli) veya null. */
  amountText: string | null;
  /** Marj yüzdesi ("31,9") veya null. */
  marginPct: string | null;
  /** Kâr negatifse (bedel maliyetin altında) uyarı tonu için. */
  isLoss: boolean;
}

/**
 * "Bu Satıştan Kâr" (89-92). Maliyet GERÇEK sunucu değeri, bedel kullanıcı
 * girdisidir. Maliyet yoksa ya da bedel geçersizse "—" (uydurma yok).
 */
export function deriveSaleProfit(salePrice: number | null, cost: UnitCostInfo): SaleProfit {
  if (!cost.available || cost.rawValue === null || salePrice === null) {
    return { available: false, amountText: null, marginPct: null, isLoss: false };
  }
  const profit = salePrice - cost.rawValue;
  const marginPct = salePrice > 0 ? (profit / salePrice) * 100 : null;
  return {
    available: true,
    amountText: formatAmount(profit),
    marginPct: marginPct === null ? null : formatAmount(marginPct),
    isLoss: profit < 0,
  };
}
