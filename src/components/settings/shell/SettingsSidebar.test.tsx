import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsSidebar } from "./SettingsSidebar";

let sessionMe: Record<string, unknown> | null = null;
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: sessionMe, isLoading: false }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/ayarlar/kullanicilar" }));
vi.mock("@/lib/shell/useLogout", () => ({ useLogout: () => ({ logout: vi.fn(), error: null }) }));
vi.mock("@/lib/api/hooks/usePages", () => ({ usePages: () => ({ data: undefined }) }));

const grant = (level: "none" | "view" | "edit") => ({ level, approve: false });

afterEach(() => {
  sessionMe = null;
});

describe("SettingsSidebar · menü gizleme (IZN-F2.2)", () => {
  it("oturum yokken (yükleniyor) tüm öğeler görünür", () => {
    render(<SettingsSidebar />);

    expect(screen.getByRole("link", { name: /Sayfa İzinleri/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kullanıcılar/ })).toBeInTheDocument();
  });

  it("grant'ı 'none' olan Ayarlar sayfası menüde gizlenir; grant'ı olmayan görünür kalır", () => {
    sessionMe = {
      is_system_admin: false,
      pages: { "ayarlar.sayfa_izinleri": grant("none"), "ayarlar.rol_yonetimi": grant("view") },
    };
    render(<SettingsSidebar />);

    expect(screen.queryByRole("link", { name: /Sayfa İzinleri/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Rol Yönetimi/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kullanıcılar/ })).toBeInTheDocument();
  });

  it("Sistem Yöneticisi 'none' hücreleri olsa bile her şeyi görür", () => {
    sessionMe = { is_system_admin: true, pages: { "ayarlar.sayfa_izinleri": grant("none") } };
    render(<SettingsSidebar />);

    expect(screen.getByRole("link", { name: /Sayfa İzinleri/ })).toBeInTheDocument();
  });

  it("bir gruptaki tüm öğeler gizlenirse grup başlığı DÜŞER", () => {
    sessionMe = {
      is_system_admin: false,
      pages: Object.fromEntries(
        ["bordro_oranlari", "entegrasyonlar", "yedekleme", "denetim_gunlugu"].map((key) => [`ayarlar.${key}`, grant("none")]),
      ),
    };
    render(<SettingsSidebar />);

    expect(screen.queryByText("SİSTEM")).toBeNull();
    expect(screen.getByText("GENEL")).toBeInTheDocument();
    expect(screen.getByText("KULLANICI & ERİŞİM")).toBeInTheDocument();
  });
});
