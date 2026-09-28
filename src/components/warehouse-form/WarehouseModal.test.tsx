import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { BackendError } from "@/lib/api/unwrap";
import { useSiteFanOutOptions } from "@/lib/api/hooks/useSiteFanOutOptions";
import { useCreateWarehouse } from "@/lib/api/hooks/useStockMutations";

import { WarehouseModal } from "./WarehouseModal";
import { KEEP_FLOW_NEEDS_SITE_REASON, WAREHOUSE_TEXT as TEXT } from "./constants";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/hooks/useStockMutations", () => ({ useCreateWarehouse: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteFanOutOptions", () => ({ useSiteFanOutOptions: vi.fn() }));

const PROJECT_ID = "pppppppp-0000-0000-0000-000000000001";
const SITE_ID = "ssssssss-0000-0000-0000-000000000001";

const mutate = vi.fn();
const onClose = vi.fn();

function fanOutStub(overrides: Record<string, unknown> = {}) {
  return {
    options: [
      {
        siteId: SITE_ID,
        siteName: "A-Blok Şantiyesi",
        projectId: PROJECT_ID,
        projectName: "Güneşkent Konut",
      },
    ],
    isLoading: false,
    isError: false,
    failedProjectNames: [],
    truncation: { isTruncated: false, shownCount: 1, totalCount: 1 },
    isPartial: false,
    ...overrides,
  } as never;
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCreateWarehouse).mockReturnValue({ mutate, isPending: false } as never);
  vi.mocked(useSiteFanOutOptions).mockReturnValue(fanOutStub());
});

describe("WarehouseModal — DP mockup'ı (Form - Depo Ekle)", () => {
  it("başlık ve alt başlık mockup'tan gelir (72-73)", () => {
    render(<WarehouseModal onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: TEXT.title })).toBeInTheDocument();
    expect(screen.getByText(TEXT.subtitle)).toBeInTheDocument();
  });

  it("🔴 şantiye TEK seçicidir ve seçenek metni 'Şantiye · Proje'dir (86-93)", () => {
    render(<WarehouseModal onClose={onClose} />);
    // Eski iki adımlı akışın "Proje" seçicisi ARTIK YOK.
    expect(screen.queryByLabelText(/^Proje/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "A-Blok Şantiyesi · Güneşkent Konut" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: TEXT.siteEmptyOption })).toBeInTheDocument();
  });

  it("🔴 şantiye seçilmezse `site_id` gövdede HİÇ taşınmaz (= MERKEZ depo)", () => {
    render(<WarehouseModal onClose={onClose} />);
    fireEvent.change(screen.getByTestId("whf-name"), { target: { value: "Merkez Depo" } });
    submit();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ name: "Merkez Depo" });
    expect(mutate.mock.calls[0][0]).not.toHaveProperty("site_id");
  });

  it("şantiye seçilirse `site_id` gövdeye girer", () => {
    render(<WarehouseModal onClose={onClose} />);
    fireEvent.change(screen.getByTestId("whf-name"), { target: { value: "D-1 Ambar" } });
    fireEvent.change(screen.getByTestId("whf-site"), { target: { value: SITE_ID } });
    submit();

    expect(mutate.mock.calls[0][0]).toEqual({ name: "D-1 Ambar", site_id: SITE_ID });
  });

  it("ad boşken AĞA ÇIKILMAZ", () => {
    render(<WarehouseModal onClose={onClose} />);
    submit();
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("whf-error")).toHaveTextContent("Depo adı zorunludur.");
  });

  it("sunucu hatası YUTULMAZ — Türkçe `detail` basılır (§4b kanonu)", () => {
    mutate.mockImplementation((_body, options) =>
      options.onError(new BackendError(404, { detail: "Şantiye bulunamadı." })),
    );
    render(<WarehouseModal onClose={onClose} />);
    fireEvent.change(screen.getByTestId("whf-name"), { target: { value: "D-9" } });
    submit();

    expect(screen.getByText("Şantiye bulunamadı.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("WarehouseModal — canlı önizleme (98-109)", () => {
  it("ad girilmeden yer tutucu + MERKEZ rozeti basılır (104-107)", () => {
    render(<WarehouseModal onClose={onClose} />);
    const preview = screen.getByTestId("whf-preview");

    expect(preview).toHaveTextContent(TEXT.previewNamePlaceholder);
    expect(preview).toHaveTextContent(TEXT.previewCentralLabel);
    expect(screen.getByTestId("whf-central-badge")).toHaveTextContent(TEXT.centralBadge);
  });

  it("ad ve şantiye seçilince önizleme canlı güncellenir, MERKEZ rozeti DÜŞER", () => {
    render(<WarehouseModal onClose={onClose} />);
    fireEvent.change(screen.getByTestId("whf-name"), { target: { value: "D-4 Kapalı Ambar" } });
    fireEvent.change(screen.getByTestId("whf-site"), { target: { value: SITE_ID } });

    const preview = screen.getByTestId("whf-preview");
    expect(preview).toHaveTextContent("D-4 Kapalı Ambar");
    expect(preview).toHaveTextContent("A-Blok Şantiyesi · Güneşkent Konut");
    expect(screen.queryByTestId("whf-central-badge")).not.toBeInTheDocument();
  });
});

describe("WarehouseModal — 'stok girişine dön' onay kutusu (119-127)", () => {
  it("🔴 merkez depo kipinde DEVRE-DIŞIdır ve gerekçe GÖRÜNÜR", () => {
    render(<WarehouseModal onClose={onClose} />);
    expect(screen.getByTestId("whf-keep-flow")).toBeDisabled();
    expect(screen.getByTestId("whf-keep-flow-reason")).toHaveTextContent(
      KEEP_FLOW_NEEDS_SITE_REASON,
    );
  });

  it("şantiye seçilince açılır ve kayıttan sonra stok girişine GERÇEKTEN döner", () => {
    mutate.mockImplementation((_body, options) => options.onSuccess());
    render(<WarehouseModal onClose={onClose} />);
    fireEvent.change(screen.getByTestId("whf-name"), { target: { value: "D-1" } });
    fireEvent.change(screen.getByTestId("whf-site"), { target: { value: SITE_ID } });
    fireEvent.click(screen.getByTestId("whf-keep-flow"));
    submit();

    expect(push).toHaveBeenCalledWith(
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/stok/giris`,
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("kutu işaretlenmemişse yönlendirme YAPILMAZ", () => {
    mutate.mockImplementation((_body, options) => options.onSuccess());
    render(<WarehouseModal onClose={onClose} />);
    fireEvent.change(screen.getByTestId("whf-name"), { target: { value: "D-1" } });
    fireEvent.change(screen.getByTestId("whf-site"), { target: { value: SITE_ID } });
    submit();

    expect(push).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // M5_1 kayıt #58: şantiye boşalınca eski niyet HAM STATE'te diriliyordu —
  // görünen `checked` türevi kutuyu boş gösterse de `onSuccess`teki gerçek
  // okuma ham `shouldReturnToEntry`i okuyordu.
  it("şantiye boşaltılıp YENİDEN seçilirse eski 'dön' niyeti DİRİLMEZ", () => {
    mutate.mockImplementation((_body, options) => options.onSuccess());
    render(<WarehouseModal onClose={onClose} />);
    fireEvent.change(screen.getByTestId("whf-name"), { target: { value: "D-1" } });
    fireEvent.change(screen.getByTestId("whf-site"), { target: { value: SITE_ID } });
    fireEvent.click(screen.getByTestId("whf-keep-flow"));

    // Şantiye boşaltılır (ör. "MERKEZ DEPO" seçilir) — kutu görünmez/kapanır.
    fireEvent.change(screen.getByTestId("whf-site"), { target: { value: "" } });
    // Şantiye YENİDEN seçilir — kullanıcı kutuyu bir daha işaretlemedi.
    fireEvent.change(screen.getByTestId("whf-site"), { target: { value: SITE_ID } });
    submit();

    expect(push).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("WarehouseModal — fan-out eksikleri", () => {
  it("🔴 alt istek düşerse SESSİZ ATLANMAZ: hangi projeler eksik, yazılır", () => {
    vi.mocked(useSiteFanOutOptions).mockReturnValue(
      fanOutStub({ failedProjectNames: ["Liman Altyapı", "Çelik OSB"] }),
    );
    render(<WarehouseModal onClose={onClose} />);

    const notice = screen.getByTestId("whf-site-fanout-error");
    expect(notice).toHaveTextContent("Liman Altyapı, Çelik OSB");
    expect(notice).toHaveTextContent("aşağıdaki listede YOK");
  });

  it("proje listesi kırpılırsa görünür bant basılır (korkuluk sızdırılır)", () => {
    vi.mocked(useSiteFanOutOptions).mockReturnValue(
      fanOutStub({
        isPartial: true,
        truncation: { isTruncated: true, shownCount: 50, totalCount: 120 },
      }),
    );
    render(<WarehouseModal onClose={onClose} />);
    expect(screen.getByTestId("whf-site-truncation")).toHaveTextContent("liste eksik");
  });

  it("her şey yolundayken uyarı bandı BASILMAZ", () => {
    render(<WarehouseModal onClose={onClose} />);
    expect(screen.queryByTestId("whf-site-fanout-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("whf-site-truncation")).not.toBeInTheDocument();
  });
});

describe("WarehouseModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı + dokunulmadı → false", () => {
    render(<WarehouseModal onClose={onClose} />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("depo adı yazıldı → true", () => {
    render(<WarehouseModal onClose={onClose} />);
    fireEvent.change(screen.getByTestId("whf-name"), { target: { value: "Merkez Depo" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess: onClose) → unmount ile false", () => {
    mutate.mockImplementation((_body, options) => options.onSuccess());
    const { unmount } = render(<WarehouseModal onClose={onClose} />);
    fireEvent.change(screen.getByTestId("whf-name"), { target: { value: "Merkez Depo" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    submit();
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
