import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { pendingModuleLabel, type PendingModuleKey } from "@/lib/pending-modules";

import "./dashboard.css";

export function CardEmptyState({
  title,
  pendingModule,
  isHidden = false,
}: {
  title: string;
  /**
   * IZN-F4.2 · zarfın 3. hâli (`available:false` + `pending_module:null` = rolün izni yok): kart değeri "—" + küçük
   * kilit + "Bu bilgi rolünüz için gizli". `pendingModule` verilmiş olsa bile gizli hâl önceliklidir.
   */
  isHidden?: boolean;
  // Opsiyonel: gerekce satiri YALNIZ anahtar DOLU oldugunda basilir. IKI hâl
  // bilerek atlanir ve ayri sebeplerle sessiz kalir:
  //   1. `undefined` — anahtarin bayat kaldigi yuzeylerde (or. onay karti)
  //      cagiran taraf gerekceyi bilerek gecmez.
  //   2. `null` — K-ZARF UCUNCU HALI: backend'in `restricted()` fabrikasi
  //      (`available:false` + `pending_module:null`) "ROLUN IZNI YOK" der.
  //      Modul VARDIR; `pendingModuleLabel(null)` bu hâlde "İlgili modülle
  //      birlikte gelir" dondurur ve bu cumle O HÂLDE YALANDIR.
  pendingModule?: PendingModuleKey;
}) {
  return (
    <div className="dash-empty">
      {isHidden ? (
        <>
          <p className="dash-empty__title">
            —
            <HiddenMark />
          </p>
          <p className="dash-empty__hint">{HIDDEN_FIELD_HINT}</p>
        </>
      ) : (
        <p className="dash-empty__title">{title}</p>
      )}
      {/* 🔴 KASITLI GEVSEK ESITLIK: `!= null` hem `null` hem `undefined`
          yakalar — yukaridaki iki hâl de tek dalda susar. `!== undefined`
          YETMEZ, `null`i gecirir ve ekran sahte gerekce basar. */}
      {!isHidden && pendingModule != null && (
        <p className="dash-empty__hint">{pendingModuleLabel(pendingModule)}</p>
      )}
    </div>
  );
}
