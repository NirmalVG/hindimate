// app/fonts.ts
import { Plus_Jakarta_Sans, Be_Vietnam_Pro, Baloo_2 } from "next/font/google"

// Display/headline typeface — Latin only, matches DESIGN.md display-lg/headline-md
export const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
})

// Body/label typeface — Latin only, matches DESIGN.md body-lg/body-md/label-caps
export const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "700"], // Be Vietnam Pro isn't a variable font on Google Fonts, so pin the weights DESIGN.md actually uses
  variable: "--font-be-vietnam",
  display: "swap",
})

// Devanagari + Latin display typeface — the fix for DESIGN.md's devanagari-display token
export const baloo2 = Baloo_2({
  subsets: ["devanagari", "latin"],
  variable: "--font-baloo",
  display: "swap",
})
