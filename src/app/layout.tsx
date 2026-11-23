import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Vektora Finance — PT Vektora Teknologi Nusantara",
  description:
    "Keuangan multi-brand PT Vektora: WhereIsIt, Moonimo. Income, pengeluaran, investasi, hutang, gaji OPEX, pembagian fee, dan slip gaji.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
