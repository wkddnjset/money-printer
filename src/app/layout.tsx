import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { StatusBar } from "@/components/layout/StatusBar";

export const metadata: Metadata = {
  title: "Money Printer - Crypto Scalping Robo-Advisor",
  description: "개인용 코인 초단타 자동매매 시스템",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="h-screen flex flex-col overflow-hidden">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto p-4">{children}</main>
        </div>
        <StatusBar />
      </body>
    </html>
  );
}
