import type { Metadata } from "next";
import { Inter, Hind_Siliguri, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "@/lib/env";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { AuthProvider } from "@/components/shared/auth-provider";
import { Toaster } from "sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const hindSiliguri = Hind_Siliguri({
  variable: "--font-hind-siliguri",
  subsets: ["bengali", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RUET ELMS",
  description:
    "Rajshahi University of Engineering & Technology - Learning Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${hindSiliguri.variable} ${jetbrainsMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>{children}</AuthProvider>
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{
              className:
                "font-sans border border-border bg-surface text-foreground shadow-lg",
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
