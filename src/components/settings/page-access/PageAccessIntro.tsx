/** Sayfa başındaki 3 satırlık bilgi bandı (mockup: sol mavi çizgili). */
export function PageAccessIntro() {
  return (
    <div className="page-access-intro">
      <p>
        <b>Görmez</b> seçilen sayfa o rolün menüsünde gizlenir.
      </p>
      <p>
        Silme yalnız <b>Sistem Yöneticisi</b>&apos;ndedir; hiçbir hücrede silme seçeneği yoktur.
      </p>
      <p>
        <b>Onaylar</b> kutucuğu yalnız onay zinciri / onay eylemi olan sayfalarda görünür.
      </p>
    </div>
  );
}
