import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ETOS Assessment Center",
  description: "Awardee Development Assessment — Kenali diri, pahami kondisi, tentukan arah.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
