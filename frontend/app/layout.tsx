// app/layout.tsx
import type { Metadata } from "next"
import { plusJakarta, beVietnam, baloo2 } from "./fonts"
import { Providers } from "./providers"
import "./globals.css"

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
    <html lang="en">
      <body
        className={`${plusJakarta.variable} ${beVietnam.variable} ${baloo2.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
