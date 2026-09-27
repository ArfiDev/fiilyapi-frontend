/**
 * PLN-F1.5 · Disiplin grafik paleti — VERİ, stil değil.
 *
 * Seçilen renk backend'e `color` (`^#[0-9A-Fa-f]{6}$`) olarak yazılır ve
 * grafiklerde veriden basılır (`style={{ background: color }}`); bu yüzden
 * CSS token'ı DEĞİL, hex dizisidir.
 *
 * KAT-F1b · 5→10 genişleme — KARARLAR.md 2026-09-27 "Disiplin renk paleti"
 * (kullanıcı onaylı sapma; mockup'taki 5'li paletten): santral simülasyonunda
 * 8 disiplin (ALT, INS, CLK, MEK, ELK, ENS, MIM, CPH) olacağından 5 renk
 * 6. disiplinden itibaren tekrar ediyordu ve hepsi mavi/gri tonundaydı. Son 5
 * renk `src/styles/tokens.css`'ten türetildi — mevcut 5 (mavi/gri aileleri)
 * dışında, birbirinden ve komşusundan ayrılabilen ton aileleri seçildi; kırmızı
 * ve yeşil bilerek YAN YANA konmadı (renk körlüğü). Her biri beyaz zeminde
 * nokta/çubuk için WCAG göreli parlaklık kontrastı ≥3:1 (bkz. görev raporu HEX
 * tablosu):
 *   #dc2626 kırmızı  (--color-danger-strong)      kontrast 4.83:1
 *   #7c3aed mor      (--color-accent-purple)      kontrast 5.70:1
 *   #0f766e camgöbeği (--color-accent-teal-start) kontrast 5.47:1
 *   #16a34a yeşil    (--color-success)            kontrast 3.30:1
 *   #d97706 amber    (--color-warning-strong)     kontrast 3.19:1
 *
 * SIRA · kullanıcı kararı KAT-F1b (b) — 2026-09-27: 7 belirgin ton öne, 3
 * açık ton (#93c5fd, #cbd5e1, #e2e8f0 — hepsi kontrastı diğerlerinden düşük)
 * sona alındı. Bu SIRA yalnız `suggestedPaletteColor`in YENİ disipline
 * önerdiği rengi etkiler; mevcut disiplinlerin rengi backend'de değer olarak
 * SAKLI olduğundan (DisciplineRead.color) bu diziden bağımsızdır — sıra
 * değişince hiçbir mevcut kaydın rengi değişmez. DEĞER kümesi ve her rengin
 * kontrast/köklük gerekçesi yukarıdaki gibi SABİT kalır, yalnız SIRA
 * değişti. 11.+ disiplinde palet başa döner (`suggestedPaletteColor`); aynı
 * renk iki disipline verilebilir (F0-7).
 */
export const DISCIPLINE_PALETTE: readonly string[] = [
  "#2563eb",
  "#dc2626",
  "#64748b",
  "#7c3aed",
  "#0f766e",
  "#16a34a",
  "#d97706",
  "#93c5fd",
  "#cbd5e1",
  "#e2e8f0",
];
