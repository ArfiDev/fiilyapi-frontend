/**
 * KIK:184-188 — dipnot (ÜS-8). Son fiyat kaynağı (B3) gelene dek "son fiyat … gelir"
 * cümlesi ve "+%" maddesi BASILMAZ (yanlış vaat olur); referans fiyat + turuncu tarih basılır.
 */
export function WorkItemLegend() {
  return (
    <div className="wik-legend">
      <span>Referans fiyat elle girilir</span>
      <span>
        <span className="wik-legend__stale">turuncu tarih</span>{" "}
        <span>6 aydan eski fiyat</span>
      </span>
    </div>
  );
}
