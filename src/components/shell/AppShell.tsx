"use client";

import { SessionProvider } from "./SessionProvider";
import { QueryProvider } from "@/lib/query/QueryProvider";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";
import { StaleBuildBanner } from "./StaleBuildBanner";
import { PageBreadcrumb } from "./breadcrumb/PageBreadcrumb";
import "./shell.css";

// Uygulama kabugu: oturum saglayici + query saglayici + sabit topbar/sidebar + icerik.
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>
        <Topbar />
        <Sidebar />
        <main className="app-content">
          {/* PLN-F2.0 — yalnız sürüm uyumsuzluğunda basılır (bkz. app-build.ts). */}
          <StaleBuildBanner />
          {/* SEKME-F1.2 — kırıntı KABUK DÜZEYİNDE burada, StaleBuildBanner'ın
              ALTINDA ve `{children}`dan ÖNCE basılır (KARARLAR §1.10). Tek
              parçalı rotalarda ve `/ayarlar` altında `PageBreadcrumb` kendisi
              null döner; ekranların kendi başlık-üstü satırları DEĞİŞMEDİ. */}
          <PageBreadcrumb />
          {children}
        </main>
      </QueryProvider>
    </SessionProvider>
  );
}
