import { joinDisciplineNames } from "@/lib/shell/disciplineSummary";

import "./restricted-empty-notice.css";

export interface RestrictedEmptyNoticeProps {
  /** Kullanıcının atanmış disiplin adları; ad bilinmiyorsa boş dizi. */
  names: readonly string[];
}

/**
 * Disiplini atanmış (kısıtlı) kullanıcı için ortak boş durum. Backend
 * süzmesi yüzünden liste boş dönebilir; mockup: Ayarlar - Kullanıcı
 * Disiplin Ataması ("Yapılan miktarlar · filtre").
 */
export function RestrictedEmptyNotice({ names }: RestrictedEmptyNoticeProps) {
  const hasNames = names.length > 0;
  const noun = names.length > 1 ? "disiplinlerindeki" : "disiplinindeki";
  return (
    <div className="restricted-empty" data-testid="restricted-empty-notice">
      <div className="restricted-empty-title">Disiplininize ait kayıt yok.</div>
      <div className="restricted-empty-desc">
        {hasNames ? (
          <>
            Yalnız <b>{joinDisciplineNames(names)}</b> {noun} kalemleri görüyorsunuz.
          </>
        ) : (
          "Yalnız atanmış disiplinlerinizdeki kalemleri görüyorsunuz."
        )}
      </div>
    </div>
  );
}
