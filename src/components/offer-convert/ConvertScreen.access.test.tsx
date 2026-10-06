import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { backendClient } from "@/lib/api/client";

import { permissionState, resetPermissions, scopeState } from "./convert-permission.testkit";
import {
  OFFER_ID, PROJECT_ID, fail, installBackend, rawControls, renderConvert, wonBackend, wonDetail,
} from "./convert-screen.testkit";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn() } }));
vi.mock("@/lib/auth/useModulePermission", async () => import("./convert-permission.testkit").then((m) => m.modulePermissionMock));
vi.mock("@/components/shell/SessionProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/SessionProvider")>();
  const { sessionMockFor } = await import("./convert-permission.testkit");
  return { ...actual, useSession: () => ({ ...actual.SESSION_CONTEXT_DEFAULT, me: sessionMockFor(), isLoading: false }) };
});
vi.mock("@/lib/auth/useDisciplineScope", async () => import("./convert-permission.testkit").then((m) => m.disciplineScopeMock));

const NOT_WON = "Yalnız son revizyonu kazanılmış (won) olan teklif projeye dönüştürülebilir";

beforeEach(() => {
  vi.clearAllMocks();
  resetPermissions();
  installBackend(wonBackend());
});

describe("TKL-F5.3 · Dönüştür — erişim durumları (plan §1 'Erişim durumları', §6)", () => {
  it("kazanılmış + dönüştürülmemiş teklifte başlık, 'Kazanıldı' çipi, alt satır ve 'Vazgeç, teklife dön' bağlantısı", async () => {
    renderConvert();
    expect(await screen.findByRole("heading", { level: 1, name: "Proje ve Sözleşmeye Dönüştür" })).toBeInTheDocument();
    expect(screen.getByText("Kazanıldı")).toBeInTheDocument();
    expect(screen.getByText("TKL-2026-0014 Rev.2")).toBeInTheDocument();
    expect(screen.getByText(/Güneşkent Konut Kompleksi · Kuzey Gayrimenkul A\.Ş\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vazgeç, teklife dön" })).toHaveAttribute("href", `/teklif-hazirlama/${OFFER_ID}`);
  });

  it("403 (okuma) → AccessDenied; form yok", async () => {
    installBackend(wonBackend({ detail: fail(403, { detail: "Bu işlem için yetkiniz yok" }) }));
    renderConvert();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByLabelText("Proje adı")).not.toBeInTheDocument();
  });

  it("projects < admin → AccessDenied; AĞ İSTEĞİ de atılmaz (izin kapısı yüklemeden önce)", async () => {
    permissionState.levels = { contracts: "full", projects: "full" };
    renderConvert();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("contracts < full → AccessDenied", async () => {
    permissionState.levels = { contracts: "view", projects: "admin" };
    renderConvert();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("disiplin kısıtlı kullanıcı → AccessDenied", async () => {
    scopeState.value = { isRestricted: true, names: ["Kaba İnşaat"] };
    renderConvert();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByLabelText("Proje adı")).not.toBeInTheDocument();
  });

  // IZN-F6a · bilinmezlik kuralı KALKTI: sayfa izni hiç yoksa ekran KAPALI (fail-closed).
  it("sayfa izni YOK (oturumda hücre yok) → AccessDenied; AĞ İSTEĞİ de atılmaz", async () => {
    permissionState.levels = { contracts: undefined, projects: undefined };
    renderConvert();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("teklif yok (404) → 'Teklif bulunamadı' + 'Tekliflere dön'", async () => {
    installBackend(wonBackend({ detail: fail(404, { detail: "Teklif bulunamadı" }) }));
    renderConvert();
    expect(await screen.findByText("Teklif bulunamadı")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tekliflere dön" })).toHaveAttribute("href", "/teklif-hazirlama");
  });

  it("zaten dönüştürülmüş → bilgi kartı + 'Projeyi aç →' (proje künyesi: slug ?? id); FORM AÇILMAZ", async () => {
    installBackend(
      wonBackend({
        detail: wonDetail({
          conversion_state: "converted",
          project_id: PROJECT_ID,
          project: { id: PROJECT_ID, code: "PRJ-2026-004", name: "Güneşkent Konut", slug: "gunes-kent-konut" },
        }),
      }),
    );
    renderConvert();
    expect(await screen.findByText("Teklif zaten dönüştürüldü")).toBeInTheDocument();
    expect(screen.getByText(/PRJ-2026-004 · Güneşkent Konut/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projeyi aç →" })).toHaveAttribute("href", "/projeler/gunes-kent-konut");
    expect(screen.queryByLabelText("Proje adı")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Projeyi ve Sözleşmeyi Oluştur" })).not.toBeInTheDocument();
  });

  it("dönüştürülmüş ama künye yok (slug null) → proje kimliğiyle bağlantı", async () => {
    installBackend(wonBackend({ detail: wonDetail({ conversion_state: "converted", project_id: PROJECT_ID, project: null }) }));
    renderConvert();
    expect(await screen.findByRole("link", { name: "Projeyi aç →" })).toHaveAttribute("href", `/projeler/${PROJECT_ID}`);
  });

  it("kazanılmamış (gönderildi) teklif → NOT_WON metni AYNEN + 'Teklife dön'; form yok", async () => {
    installBackend(wonBackend({ detail: wonDetail({ status: "sent", conversion_state: null }) }));
    renderConvert();
    expect(await screen.findByText(NOT_WON)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Teklife dön" })).toHaveAttribute("href", `/teklif-hazirlama/${OFFER_ID}`);
    expect(screen.queryByLabelText("Proje adı")).not.toBeInTheDocument();
  });

  it("ham <input>/<select> YOK: tüm kontroller ui primitive sınıfı taşır (üç adımda da)", async () => {
    const { container } = renderConvert();
    await screen.findByLabelText("Proje adı");
    expect(rawControls(container)).toEqual([]);
  });

  it("hiçbir yerde role=alert yok (durum bantları role=status)", async () => {
    installBackend(wonBackend({ post: () => fail(403, { detail: "Bu işlem için yetkiniz yok" }) }));
    const { container } = renderConvert();
    await screen.findByLabelText("Proje adı");
    await waitFor(() => expect(container.querySelector('[role="alert"]')).toBeNull());
  });
});
