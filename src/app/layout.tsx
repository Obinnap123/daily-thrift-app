import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { PwaServiceWorker } from "@/components/providers/PwaServiceWorker";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Davchuks Daily Thrift Management System",
  description:
    "Manage daily thrift contributions, savings progress, and manual payouts for Davchuks Daily Thrift.",
  applicationName: "Davchuks Daily Thrift",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/icons/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/icons/favicon-48.png",
        sizes: "48x48",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Davchuks",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#047857",
  },
};

export const viewport: Viewport = {
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: "#047857",
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: "#07130e",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <PwaServiceWorker />
        {/* SessionProvider makes the logged-in user's session available to
            every client component via the `useSession()` hook. ToastProvider
            wraps everything so any client component can call useToast() to
            show a success/error notification. */}
        <SessionProvider>
          <ToastProvider>
            {children}
            <InstallPrompt />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
