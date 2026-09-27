"use client";

import { Suspense } from "react";
import { SessionProvider } from "./SessionProvider";
import { QueryProvider } from "@/lib/query/QueryProvider";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";
import { StaleBuildBanner } from "./StaleBuildBanner";
import { TabsRouterSync } from "./workspace-tabs/TabsRouterSync";
import "./shell.css";

// Uygulama kabugu: oturum saglayici + query saglayici + sabit topbar/sidebar + icerik.
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>
        {/* SEKME-F1.4a — URL → çalışma sekmesi senkronu (görünmez). Oturum
            (`me.id`) ve önbellek (sekme başlığı) ister, bu yüzden iki
            sağlayıcının İÇİNDE. 🔴 `useSearchParams` kullanır: Suspense
            sınırı OLMADAN `next build` statik ön-render'da kırılır; sınır
            yalnız bu bileşeni sarar, kabuk askıya alınmaz. */}
        <Suspense fallback={null}>
          <TabsRouterSync />
        </Suspense>
        <Topbar />
        <Sidebar />
        <main className="app-content">
          {/* PLN-F2.0 — yalnız sürüm uyumsuzluğunda basılır (bkz. app-build.ts). */}
          <StaleBuildBanner />
          {/* SEKME-F1.7a — kırıntı kabuk düzeyinden ÇIKTI, üst çubuğa döndü
              (`Topbar.tsx` → `TopbarBreadcrumb`). `<main>` artık kırıntı
              BASMAZ; ekranların kendi başlık-üstü satırları DEĞİŞMEDİ. */}
          {children}
        </main>
      </QueryProvider>
    </SessionProvider>
  );
}
