import type { components } from "@/lib/api/schema";

import { CardEmptyState } from "./CardEmptyState";
import "./dashboard.css";
import type { DeepScale } from "@/lib/api/scale";

/**
 * RISK-1 · "Risk & Uyarılar" kartı — zarf `ListPlaceholder`tan
 * `RiskAlertsPlaceholder`a KIRICI biçimde değişti.
 *
 * 🔴 KÖK OLAY (canlı kusur): satırlar `string` idi ve kart onları doğrudan
 * basıyordu (`{item}` + `key={item}`). Zarf `RiskAlert` NESNESİNE dönünce
 * React "Objects are not valid as a React child" attı ve AÇILIŞ SAYFASININ
 * TAMAMI çöktü (canlı gövde 136 karakter, hata ekranı). Nesne bir React
 * çocuğu olamayacağı gibi `key` de olamaz — anahtar da yeniden kuruldu.
 *
 * ─── Satırın anatomisi (mockup `Ekran 1 - Gösterge Paneli.dc.html:378-395`) ──
 * Her satır ÜÇ olgu taşır: `title` (üst, 13px), `detail` (alt, 11px) ve
 * `severity` (sol şeridin rengi + zemin tonu). Renk sunucudan GELMEZ; sunucu
 * ANLAMI (`danger|warning|success`) verir, sınıf/hex kararı istemcinindir.
 *
 * ─── 🔴 `success` BİR RİSK DEĞİLDİR ──────────────────────────────────────────
 * Kartın adı içeriğini kısmen yalanlar: üçüncü satır İYİ HABERDİR ("Hedef
 * aşıldı", yeşil). Kart aslında ŞİDDET ETİKETLİ BİR UYARI AKIŞIDIR. Yeşil
 * satırı kırmızı gibi basmak kullanıcıya olmayan bir sorun bildirirdi.
 */
type RiskAlerts = DeepScale<components["schemas"]["RiskAlertsPlaceholder"]>;
type RiskAlert = DeepScale<components["schemas"]["RiskAlert"]>;
type RiskSeverity = components["schemas"]["RiskSeverity"];

/**
 * Şiddet → sunum sınıfı. Eşleme mockup'tan ÖLÇÜLDÜ (renkler `dashboard.css`te,
 * hex burada YAZILMAZ):
 *   `warning` → kehribar `#f59e0b` · `danger` → kırmızı `#ef4444`
 *   `success` → yeşil `#22c55e`
 *
 * 🔴 `Record<RiskSeverity, string>` BİLEREK TAM KÜMEDİR: şemaya dördüncü bir
 * şiddet eklendiği gün burası DERLEME ZAMANINDA kırmızı verir. `severity`yi
 * doğrudan sınıf adına yapıştırmak (`dash-risk--${severity}`) derleyiciyi
 * susturur ve bilinmeyen bir şiddet SESSİZCE stilsiz basılırdı.
 */
const SEVERITY_CLASS: Record<RiskSeverity, string> = {
  danger: "dash-risk--danger",
  warning: "dash-risk--warning",
  success: "dash-risk--success",
};

/**
 * Liste anahtarı. 🔴 DİZİN (index) KULLANILMAZ: satırlar sunucuda şiddete göre
 * sıralanır, yani araya bir `danger` girdiğinde dizin anahtarları kayar ve
 * React yanlış satırı yeniden kullanır. `module` + `title` bu kartta bir
 * satırı tekilleştirir (aynı modül aynı başlığı iki kez üretmez).
 */
export function rowKey(alert: RiskAlert): string {
  return `${alert.module}:${alert.title}`;
}

export function RisksCard({ data }: { data: RiskAlerts }) {
  // `items`/`sources` şemada OPSİYONELDİR (`required` değil) — backend boş
  // listede alanı hiç göndermeyebilir.
  const items = data.items ?? [];
  const sources = data.sources ?? [];

  /**
   * 🔴 TRİ-STATE KARTTAN KAYNAĞA TAŞINDI (`pending_module` ARTIK YOK).
   * Kartın ÜÇ ayrı kaynağı ve ÜÇ ayrı izin kapısı var; tek bir anahtar ancak
   * üçte birini adlandırabilirdi. Sonuç: "uyarı yok" ile "bu kaynakları görme
   * yetkin yok" AYRI hâllerdir ve ekran onları AYIRT ETMEK ZORUNDADIR —
   * yetkisiz bir role "uyarı yok" demek, ekranın kullanıcıya YALAN söylemesidir.
   */
  const restricted = sources.filter((source) => source.state === "restricted");
  const isFullyRestricted = sources.length > 0 && restricted.length === sources.length;
  const isPartiallyRestricted = restricted.length > 0 && !isFullyRestricted;

  if (!data.available || items.length === 0) {
    return (
      <section className="dash-card dash-list-card">
        <h2 className="dash-list-card__title">Risk &amp; Uyarılar</h2>
        <CardEmptyState
          title={isFullyRestricted ? "Uyarıları görme yetkiniz yok" : "Uyarı yok"}
        />
        {isPartiallyRestricted && (
          <p className="dash-risk__partial">
            Bazı kaynaklar için yetkiniz yok; liste eksik olabilir.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="dash-card dash-list-card">
      <h2 className="dash-list-card__title">Risk &amp; Uyarılar</h2>
      <ul className="dash-list">
        {items.map((alert) => (
          <li key={rowKey(alert)} className={`dash-risk ${SEVERITY_CLASS[alert.severity]}`}>
            <span className="dash-risk__title">{alert.title}</span>
            <span className="dash-risk__detail">{alert.detail}</span>
          </li>
        ))}
      </ul>
      {/* 🔴 KISMİ LİSTE GÖRÜNÜR KILINIR: bazı kaynaklar yetkisiz susmuşsa
          liste EKSİKTİR. Bunu söylemeyen bir kart, gördüğü üç satırın "hepsi"
          olduğunu ima ederdi — bu turda tam bu sınıftan iki canlı kusur çıktı. */}
      {isPartiallyRestricted && (
        <p className="dash-risk__partial">
          Bazı kaynaklar için yetkiniz yok; liste eksik olabilir.
        </p>
      )}
    </section>
  );
}
