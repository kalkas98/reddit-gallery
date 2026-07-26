import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reddl — Reddit media downloader",
  description: "A local gallery-dl interface for saving Reddit videos and GIFs in bulk.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
