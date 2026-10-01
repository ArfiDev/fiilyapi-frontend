import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { SectionTypePicker } from "./SectionTypePicker";
import { useCreateSectionType, useSectionTypes } from "@/lib/api/hooks/useSectionTypes";
import { BackendError } from "@/lib/api/unwrap";

vi.mock("@/lib/api/hooks/useSectionTypes", () => ({
  useSectionTypes: vi.fn(),
  useCreateSectionType: vi.fn(),
}));

const FOUNDATION = { id: "t-1", name: "Temel & Altyapı" };
const FINISHING = { id: "t-2", name: "İnce İşler" };
const NEW_TYPE = { id: "t-3", name: "Asansör" };

const mutateAsync = vi.fn();
const refetch = vi.fn();

function mockList(state: Partial<{ data: unknown; isLoading: boolean; isError: boolean }>) {
  vi.mocked(useSectionTypes).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch,
    ...state,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList({ data: [FOUNDATION, FINISHING] });
  vi.mocked(useCreateSectionType).mockReturnValue({ mutateAsync, isPending: false } as never);
});

/** Kontrollü kap: seçilen id'yi dışarıdan görünür kılar. */
function Harness({ initial = "", error }: { initial?: string; error?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SectionTypePicker value={value} onChange={setValue} error={error} />
      <output data-testid="picked">{value}</output>
    </>
  );
}

const picker = () => screen.getByLabelText("Bölüm Tipi") as HTMLSelectElement;

describe("SectionTypePicker — liste uçtan, + Yeni tip ekle", () => {
  it("seçenekler sunucu listesinden gelir; sonuncusu '+ Yeni tip ekle'", () => {
    render(<Harness />);
    const names = within(picker()).getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual(["Seçiniz...", "Temel & Altyapı", "İnce İşler", "+ Yeni tip ekle"]);
  });

  it("zorunlu alandır: yıldız (aria-required) korunur", () => {
    render(<Harness />);
    expect(picker()).toHaveAttribute("aria-required", "true");
  });

  it("'+ Yeni tip ekle' seçilince ad kutusu + Ekle/Vazgeç açılır; seçilmeden kapalıdır", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByLabelText("Yeni tip adı")).not.toBeInTheDocument();

    await user.selectOptions(picker(), "+ Yeni tip ekle");

    expect(screen.getByLabelText("Yeni tip adı")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ekle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeInTheDocument();
  });

  it("Ekle → POST gövdesi kırpılmış ad; başarıda YENİ tip seçili olur, kutu kapanır", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ kind: "created", sectionType: NEW_TYPE });
    render(<Harness initial="t-1" />);

    await user.selectOptions(picker(), "+ Yeni tip ekle");
    await user.type(screen.getByLabelText("Yeni tip adı"), "  Asansör ");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    expect(mutateAsync).toHaveBeenCalledWith({ name: "Asansör" });
    expect(screen.getByTestId("picked")).toHaveTextContent("t-3");
    expect(screen.queryByLabelText("Yeni tip adı")).not.toBeInTheDocument();
  });

  it("🔴 409: MEVCUT tip seçilir ve backend mesajı + 'seçildi' notu GÖRÜNÜR", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({
      kind: "duplicate",
      message: "Bu bölüm tipi zaten var: İnce İşler",
      existing: FINISHING,
    });
    render(<Harness initial="t-1" />);

    await user.selectOptions(picker(), "+ Yeni tip ekle");
    await user.type(screen.getByLabelText("Yeni tip adı"), "ince işler");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    expect(screen.getByTestId("picked")).toHaveTextContent("t-2");
    expect(screen.getByText("Bu bölüm tipi zaten var: İnce İşler — seçildi")).toBeInTheDocument();
    expect(screen.queryByLabelText("Yeni tip adı")).not.toBeInTheDocument();
  });

  it("409 ama mevcut tip bulunamadı: seçim DEĞİŞMEZ, mesaj görünür, kutu açık kalır", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({
      kind: "duplicate",
      message: "Bu bölüm tipi zaten var: Hayalet",
      existing: null,
    });
    render(<Harness initial="t-1" />);

    await user.selectOptions(picker(), "+ Yeni tip ekle");
    await user.type(screen.getByLabelText("Yeni tip adı"), "hayalet");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    expect(screen.getByTestId("picked")).toHaveTextContent("t-1");
    expect(screen.getByText("Bu bölüm tipi zaten var: Hayalet")).toBeInTheDocument();
    expect(screen.getByLabelText("Yeni tip adı")).toBeInTheDocument();
  });

  it("boş ad: POST ATILMAZ, görünür hata (istemci doğrulaması)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(picker(), "+ Yeni tip ekle");
    await user.type(screen.getByLabelText("Yeni tip adı"), "   ");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Tip adı zorunludur.")).toBeInTheDocument();
  });

  it("ad uzunluğu sözleşme sınırıyla (100) kısıtlanır", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(picker(), "+ Yeni tip ekle");
    expect(screen.getByLabelText("Yeni tip adı")).toHaveAttribute("maxlength", "100");
  });

  it("Vazgeç: kutu kapanır, önceki seçim korunur, POST yok", async () => {
    const user = userEvent.setup();
    render(<Harness initial="t-2" />);
    await user.selectOptions(picker(), "+ Yeni tip ekle");
    await user.type(screen.getByLabelText("Yeni tip adı"), "Asansör");
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));

    expect(screen.queryByLabelText("Yeni tip adı")).not.toBeInTheDocument();
    expect(picker()).toHaveValue("t-2");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("409 dışı hata (403 vb.) backend mesajıyla görünür, seçim değişmez", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new BackendError(403, { detail: "Yetkisiz işlem" }));
    render(<Harness initial="t-1" />);
    await user.selectOptions(picker(), "+ Yeni tip ekle");
    await user.type(screen.getByLabelText("Yeni tip adı"), "Asansör");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    expect(await screen.findByText("Yetkisiz işlem")).toBeInTheDocument();
    expect(screen.getByTestId("picked")).toHaveTextContent("t-1");
  });

  it("normal tip seçimi onChange ile id gönderir", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(picker(), "İnce İşler");
    expect(screen.getByTestId("picked")).toHaveTextContent("t-2");
  });
});

describe("SectionTypePicker — yükleme ve hata hâlleri GÖRÜNÜR", () => {
  it("yüklenirken seçici devre dışı ve 'Yükleniyor…' görünür", () => {
    mockList({ isLoading: true });
    render(<Harness />);
    expect(picker()).toBeDisabled();
    expect(screen.getByText("Bölüm tipleri yükleniyor…")).toBeInTheDocument();
  });

  it("yüklenemezse hata + 'Yeniden dene' görünür; tıklayınca refetch", async () => {
    const user = userEvent.setup();
    mockList({ isError: true });
    render(<Harness />);
    expect(screen.getByText("Bölüm tipleri yüklenemedi.")).toBeInTheDocument();
    expect(picker()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("yüklenemese de kayıtlı bir değer varsa kullanıcı onu kaybetmez (değer korunur)", () => {
    mockList({ isError: true });
    render(<Harness initial="t-2" />);
    expect(screen.getByTestId("picked")).toHaveTextContent("t-2");
  });

  it("form hatası (zorunlu) Field hatası olarak görünür", () => {
    render(<Harness error="Bölüm tipi seçiniz." />);
    expect(screen.getByText("Bölüm tipi seçiniz.")).toBeInTheDocument();
    expect(picker()).toHaveAttribute("aria-invalid", "true");
  });
});
