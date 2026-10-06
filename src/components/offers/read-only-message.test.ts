import { describe, expect, it } from "vitest";

import { readOnlyMessage } from "./OffersScreen";

describe("readOnlyMessage · sayfa izni (IZN-F6b)", () => {
  it("Görür var, Düzenler yok → yalnız görüntüleme metni", () => {
    expect(readOnlyMessage(true, false, false)).toBe("Görüntüleyici · yalnız okuma");
  });

  it("Görür de Düzenler de yok → genel salt okunur metni", () => {
    expect(readOnlyMessage(false, false, false)).toBe(
      "Salt okunur · teklifleri yalnız Sözleşmeler tam yetkisi değiştirir",
    );
  });

  it("Düzenler var ama disiplin kısıtlı → kısıt metni", () => {
    expect(readOnlyMessage(true, true, true)).toBe("Salt okunur · disiplin kısıtlı kullanıcı teklif değiştiremez");
  });

  it("Düzenler var ve kısıtsız → boş", () => {
    expect(readOnlyMessage(true, true, false)).toBe("");
  });
});
