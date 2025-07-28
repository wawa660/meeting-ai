import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "sonner"
import Titlebar from "@/components/ui/titlebar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "MeetingAI - Smart Meeting Transcription",
  description: "AI-powered meeting transcription with smart summaries and task extraction",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>  
      <body className={inter.className}>
        <div className="overflow-y-scroll scrollbar-hover">
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>

            <Titlebar />
      
            {children}
              
            <Toaster position="top-right" />
          </ThemeProvider>
        </div>  
      </body>
    </html>
  )
}
