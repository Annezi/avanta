import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AvantaPrint — печать онлайн",
  description: "Загрузка файлов на печать для типографии AvantaPrint",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
