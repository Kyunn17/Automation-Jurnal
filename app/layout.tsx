import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Otomasi Jurnal PKL",
  description: "Web pintu masuk untuk otomasi jurnal PKL ke n8n",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
