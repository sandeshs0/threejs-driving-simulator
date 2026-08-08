import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Driving Simulator",
  description: "Browser-based 3D driving simulator built with React Three Fiber",
};

/**
 * `viewportFit: "cover"` puts the canvas under the notch and the home
 * indicator; the overlays inset themselves back out with `env(safe-area-*)`
 * in globals.css, so the picture is full-bleed and nothing you have to
 * press is under a rounded corner.
 *
 * Zoom is disabled because a double-tap on the throttle would otherwise
 * scale the page mid-corner, and there is nothing here to read close up.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
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
