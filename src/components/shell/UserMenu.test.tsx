import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserMenu } from "./UserMenu";
import type { MeResponse } from "@/lib/auth/types";

const ME = {
  full_name: "Murat Çelik",
  title: "Saha Mühendisi",
  role_key: "field_engineer",
  disciplines: [] as { id: string; code: string; name: string; color: string }[],
} as unknown as MeResponse;

function setup(over: Partial<MeResponse> = {}, extra: { logoutError?: string | null } = {}) {
  const onLogout = vi.fn().mockResolvedValue(undefined);
  render(
    <div>
      <button type="button">dışarıdaki</button>
      <UserMenu me={{ ...ME, ...over }} onLogout={onLogout} logoutError={extra.logoutError ?? null} />
      <button type="button">sonraki</button>
    </div>,
  );
  return { onLogout, trigger: screen.getByRole("button", { name: "Kullanıcı menüsü" }) };
}

describe("UserMenu", () => {
  it("kapalıyken yalnız avatar düğmesi: bas harfler, haspopup=menu, expanded=false, menü yok", () => {
    const { trigger } = setup();
    expect(trigger).toHaveTextContent("MÇ");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("tıklayınca açılır (expanded=true) ve ad, rol gösterilir", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole("menu", { name: "Kullanıcı menüsü" })).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Murat Çelik")).toBeInTheDocument();
    expect(screen.getByText("Saha Mühendisi")).toBeInTheDocument();
  });

  it("role=menu YALNIZ menü öğesini sarar; ad/rol/disiplin bilgi başlığı menünün DIŞINDA", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(menu).not.toHaveTextContent("Murat Çelik");
    expect(menu).not.toHaveTextContent("Disiplin");
    expect(menu.contains(screen.getByText("Murat Çelik"))).toBe(false);
    // Bilgi başlığı aynı açılır kartın içinde (görsel aynı).
    expect(screen.getByText("Murat Çelik").closest(".user-menu")).toBe(menu.closest(".user-menu"));
  });

  it("Tab ile odak kartın dışına çıkınca menü kapanır", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Çıkış Yap" })).toHaveFocus();
    await user.tab();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("kart içindeki bilgi metnine tıklamak (odak kaybı) menüyü KAPATMAZ", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    await user.click(screen.getByText("Murat Çelik"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("YALNIZ ad, rol, disiplin satırı ve Çıkış Yap — Profilim / Bildirim tercihleri YOK", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.queryByText("Profilim")).not.toBeInTheDocument();
    expect(screen.queryByText("Bildirim tercihleri")).not.toBeInTheDocument();
  });

  it("atamasız kullanıcı → 'Disiplin: Tümü (kısıtsız)'", async () => {
    const user = userEvent.setup();
    const { trigger } = setup({ disciplines: [] });
    await user.click(trigger);
    expect(screen.getByText("Disiplin:")).toBeInTheDocument();
    expect(screen.getByText("Tümü (kısıtsız)")).toBeInTheDocument();
  });

  it("kısıtlı kullanıcı, tek disiplin → 'Disiplin: Civil Works' ve nokta o disiplinin rengi", async () => {
    const user = userEvent.setup();
    const { trigger } = setup({ disciplines: [{ id: "d1", code: "CW", name: "Civil Works", color: "#123456" }] });
    await user.click(trigger);
    expect(screen.getByText("Civil Works")).toBeInTheDocument();
    const dot = document.querySelector(".user-menu__dot") as HTMLElement;
    expect(dot.style.backgroundColor).toBe("rgb(18, 52, 86)");
  });

  it("çok disiplin → Türkçe birleştirilmiş adlar, nokta nötr (inline renk yok)", async () => {
    const user = userEvent.setup();
    const ref = (id: string, name: string) => ({ id, code: id, name, color: "#123456" });
    const { trigger } = setup({ disciplines: [ref("a", "Civil Works"), ref("b", "Mekanik"), ref("c", "Elektrik")] });
    await user.click(trigger);
    expect(screen.getByText("Civil Works, Mekanik ve Elektrik")).toBeInTheDocument();
    expect((document.querySelector(".user-menu__dot") as HTMLElement).getAttribute("style")).toBeNull();
  });

  it("`disciplines` alanı hiç yoksa (eski oturum) çökmez, kısıtsız yazar", async () => {
    const user = userEvent.setup();
    const { trigger } = setup({ disciplines: undefined as unknown as [] });
    await user.click(trigger);
    expect(screen.getByText("Tümü (kısıtsız)")).toBeInTheDocument();
  });

  it("Esc kapatır ve odağı avatar düğmesine iade eder", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("dışarı tıklama kapatır", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "dışarıdaki" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("menünün İÇİNE tıklamak kapatmaz", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    await user.click(screen.getByText("Saha Mühendisi"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("avatar düğmesi menüyü açıp kapatır (anahtar)", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("açılınca odak Çıkış Yap öğesine gider", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Çıkış Yap" })).toHaveFocus();
  });

  it("Çıkış Yap mevcut çıkış işleyicisini çağırır", async () => {
    const user = userEvent.setup();
    const { trigger, onLogout } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Çıkış Yap" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("çıkış hatası menüde görünür (sessiz yutma yok)", async () => {
    const user = userEvent.setup();
    const { trigger } = setup({}, { logoutError: "Çıkış yapılamadı, tekrar deneyin." });
    await user.click(trigger);
    expect(screen.getByRole("alert")).toHaveTextContent("Çıkış yapılamadı, tekrar deneyin.");
  });

  it("oturum yokken (me=null) düğme kapalıdır ve açılmaz", async () => {
    const user = userEvent.setup();
    render(<UserMenu me={null} onLogout={vi.fn()} logoutError={null} />);
    const trigger = screen.getByRole("button", { name: "Kullanıcı menüsü" });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
