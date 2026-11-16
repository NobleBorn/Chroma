import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chroma — Color in focus",
  description: "An interactive computer vision playground for live webcam color detection and tracking.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
