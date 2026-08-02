import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Driving Simulator",
  description: "Browser-based 3D driving simulator built with React Three Fiber",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="overflow-hidden bg-black antialiased">{children}</body>
    </html>
  );
}
