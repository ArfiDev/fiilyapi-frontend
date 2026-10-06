import { describe, expect, it } from "vitest";

import { readOnlyMessage } from "./OffersScreen";

describe("readOnlyMessage · sayfa izni (IZN-F6b)", () => {
  it("Düzenler yok → yalnız görüntüleme metni (Görür kapısı dış bileşende geçilmiştir)", () => {
    expect(readOnlyMessage(false, false)).toBe("Görüntüleyici · yalnız okuma");
  });

  it("Düzenler yok, disiplin kısıtlı da olsa → yalnız görüntüleme metni", () => {
    expect(readOnlyMessage(false, true)).toBe("Görüntüleyici · yalnız okuma");
  });

  it("Düzenler var ama disiplin kısıtlı → kısıt metni", () => {
    expect(readOnlyMessage(true, true)).toBe("Salt okunur · disiplin kısıtlı kullanıcı teklif değiştiremez");
  });

  it("Düzenler var ve kısıtsız → boş", () => {
    expect(readOnlyMessage(true, false)).toBe("");
  });
});
