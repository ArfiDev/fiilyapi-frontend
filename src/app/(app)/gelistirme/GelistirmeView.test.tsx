import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GelistirmeView } from "./GelistirmeView";
import { BOS_FIKSTUR, FIKSTUR } from "./gelistirme.fixture";

let sessionValue: { me: { role_key: string } | null; isLoading: boolean };
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: () => sessionValue }));

beforeEach(() => {
  sessionValue = { me: { role_key: "system_admin" }, isLoading: false };
});

describe("GelistirmeView", () => {
  it("system_admin: kartlar, dilim tablosu, kararlar ve bolumler gorunur", () => {
    render(<GelistirmeView veri={FIKSTUR} />);
    expect(screen.getByText(`Son güncelleme: ${FIKSTUR.guncellendi}`)).toBeInTheDocument();
    const kart = screen.getByTestId("gorev-GDV");
    expect(within(kart).getByRole("table")).toBeInTheDocument();
    expect(within(kart).getByText("devam backend dilimi")).toBeInTheDocument();
    expect(within(kart).getByText("B1 merge bekler")).toBeInTheDocument();
    expect(within(kart).getByText("devam karari bir")).toBeInTheDocument();
    for (const baslik of ["Kararı alınmış, başlamamış", "Beklemede", "Senden karar bekleyen", "Backend sırası", "Frontend sırası"]) {
      expect(screen.getByText(baslik, { selector: "h2, .card-title" })).toBeInTheDocument();
    }
    expect(screen.getByText("BKL · Baslamamis Is")).toBeInTheDocument();
    expect(screen.getByText("Fikstur sorusu")).toBeInTheDocument();
  });

  it("beklemede gorev Beklemede bolumunde de listelenir", () => {
    render(<GelistirmeView veri={FIKSTUR} />);
    const bolum = screen.getByRole("region", { name: "Beklemede" });
    expect(within(bolum).getByTestId("gorev-GBK")).toBeInTheDocument();
  });

  it("gorev kartlari devam, sonra sirada, sonra digerleri sirasindadir", () => {
    render(<GelistirmeView veri={FIKSTUR} />);
    const bolum = screen.getByRole("region", { name: "Görevler" });
    const kartlar = within(bolum).getAllByTestId(/^gorev-/).map((el) => el.getAttribute("data-testid"));
    expect(kartlar).toEqual(["gorev-GDV", "gorev-GSR", "gorev-GBK", "gorev-GBT"]);
  });

  it("bos veriyle her bolumun bos metni gorunur", () => {
    render(<GelistirmeView veri={BOS_FIKSTUR} />);
    expect(screen.getByText("Görev yok.")).toBeInTheDocument();
    expect(screen.getByText("Kararı alınmış, başlamamış iş yok.")).toBeInTheDocument();
    expect(screen.getByText("Beklemede iş yok.")).toBeInTheDocument();
    expect(screen.getByText("Karar bekleyen soru yok.")).toBeInTheDocument();
    expect(screen.getAllByText("Kuyrukta iş yok.")).toHaveLength(2);
  });

  it("admin disi (patron) gorunce AccessDenied basilir, icerik YOK", () => {
    sessionValue = { me: { role_key: "patron" }, isLoading: false };
    render(<GelistirmeView veri={FIKSTUR} />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByText(/Son güncelleme/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("gorev-GDV")).not.toBeInTheDocument();
  });

  it("oturum yuklenirken ve oturum yokken icerik basilmaz", () => {
    sessionValue = { me: null, isLoading: true };
    const { container, rerender } = render(<GelistirmeView veri={FIKSTUR} />);
    expect(container).toBeEmptyDOMElement();
    sessionValue = { me: null, isLoading: false };
    rerender(<GelistirmeView veri={FIKSTUR} />);
    expect(screen.queryByText(/Son güncelleme/)).not.toBeInTheDocument();
  });
});
