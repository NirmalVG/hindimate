// app/layout.tsx
import type { Metadata } from "next"
import { plusJakarta, beVietnam, baloo2 } from "./fonts"
import "./globals.css"
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "HindiMate — Learn Hindi with an AI tutor",
  description: "A conversational AI companion for learning Hindi.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body
        className={`${plusJakarta.variable} ${beVietnam.variable} ${baloo2.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
