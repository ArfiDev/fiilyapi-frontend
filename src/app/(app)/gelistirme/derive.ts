// GLS-F1 GEÇİCİ — saf türetme (sıralama, kuyruk özeti, bölüm süzgeçleri).
import type { Dilim, Durum, Gorev, Hat } from "./veri";

export type KuyrukSatiri = { gorevKod: string; dilim: Dilim };

const GOREV_SIRASI: Record<Durum, number> = { devam: 0, sirada: 1, beklemede: 2, bitti: 3 };
const KUYRUK_SIRASI: Partial<Record<Durum, number>> = { devam: 0, sirada: 1 };

/** devam, sonra sirada, sonra diğerleri; eşitlikte girdi sırası korunur. Girdiyi değiştirmez. */
export function siraliGorevler(gorevler: readonly Gorev[]): Gorev[] {
  return gorevler
    .map((gorev, index) => ({ gorev, index }))
    .sort((a, b) => GOREV_SIRASI[a.gorev.durum] - GOREV_SIRASI[b.gorev.durum] || a.index - b.index)
    .map(({ gorev }) => gorev);
}

/** Bir hattın kuyruğu: yalnız devam/sirada dilimler; beklemede/bitti görevlerin dilimleri girmez. */
export function kuyrukOzeti(gorevler: readonly Gorev[], hat: Hat): KuyrukSatiri[] {
  const satirlar: KuyrukSatiri[] = [];
  for (const gorev of siraliGorevler(gorevler)) {
    if (gorev.durum === "beklemede" || gorev.durum === "bitti") continue;
    for (const dilim of gorev.dilimler) {
      if (dilim.hat === hat && KUYRUK_SIRASI[dilim.durum] !== undefined) {
        satirlar.push({ gorevKod: gorev.kod, dilim });
      }
    }
  }
  return satirlar
    .map((satir, index) => ({ satir, index }))
    .sort(
      (a, b) =>
        (KUYRUK_SIRASI[a.satir.dilim.durum] ?? 0) - (KUYRUK_SIRASI[b.satir.dilim.durum] ?? 0) ||
        a.index - b.index,
    )
    .map(({ satir }) => satir);
}

export function beklemedeGorevler(gorevler: readonly Gorev[]): Gorev[] {
  return gorevler.filter((gorev) => gorev.durum === "beklemede");
}
