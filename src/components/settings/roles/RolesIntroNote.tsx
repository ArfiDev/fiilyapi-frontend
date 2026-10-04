/** Sayfa üstü bilgi bandı. "İzinler Sayfa İzinleri'nde ayarlanır" notu YALNIZ burada durur (kartlarda yok). */
export function RolesIntroNote() {
  return (
    <div className="roles-intro">
      <p>
        <b>İzinler Sayfa İzinleri ekranında ayarlanır</b>; bu ekranda yalnız rollerin kendisi yönetilir.
      </p>
      <p>
        Rol silme yalnız <b>Sistem Yöneticisi</b>&apos;ne açıktır ve yalnız <b>kullanıcısı olmayan</b> rolde
        yapılabilir.
      </p>
    </div>
  );
}
