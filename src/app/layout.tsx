import type { Metadata } from "next";
import "./portal.css";

export const metadata: Metadata = {
  title: "KanaLens-01 Reading Terminal",
  description: "A private Japanese intensive reading terminal powered by AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col bg-washi text-sumi">
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
