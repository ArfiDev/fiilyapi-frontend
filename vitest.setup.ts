import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

import { meFixture } from "@/lib/auth/page-grants.testkit";

// IZN-F6a · sağlayıcısız render'da (`useSession` varsayılan bağlamı: me yok, yükleniyor) kapılar artık modül
// izni fallback'ine DÜŞMEZ → düğmeler kapalı olurdu. Oturum KURMAYAN testler bugüne kadar "her şey açık" varsaydığı
// için varsayılan bağlam yerine TAM ERİŞİM oturumu (SA değil) verilir. `SessionProvider`ı kendisi sahteleyen
// (dosya düzeyinde `vi.mock`) ya da gerçek sağlayıcıyla render eden testler ETKİLENMEZ: yalnız varsayılan bağlam
// NESNESİ (sağlayıcı yok) yer değiştirir.
vi.mock("@/components/shell/SessionProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/SessionProvider")>();
  const fullAccessSession = { ...actual.SESSION_CONTEXT_DEFAULT, me: meFixture(), isLoading: false };
  return {
    ...actual,
    useSession: () => {
      const session = actual.useSession();
      return session === actual.SESSION_CONTEXT_DEFAULT ? fullAccessSession : session;
    },
  };
});

// Node'un yerleşik `Request` sınıfı (undici) göreli URL'leri kabul etmez; tarayıcıda
// `backendClient`/`apiClient` göreli baseUrl (`/api/...`) ile document konumuna göre
// çözülür. Testlerde bu davranışı taklit etmek için göreli girişleri sabit bir
// origin'e göre çözüyoruz (yalnızca test ortamı, uygulama kodu değişmiyor).
const OriginalRequest = globalThis.Request;

class TestRequest extends OriginalRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === "string" && input.startsWith("/")) {
      super(new URL(input, "http://localhost"), init);
    } else {
      super(input, init);
    }
  }

  // `String(request)` normalde spesifikasyona göre "[object Request]" döner;
  // `fetch` mock'larında URL'e göre dallanan testler (`String(input).includes(...)`)
  // bu yüzden çalışmaz. Test ortamında `.url`'i döndürerek bunu düzeltiyoruz.
  toString(): string {
    return this.url;
  }
}

globalThis.Request = TestRequest as unknown as typeof Request;
