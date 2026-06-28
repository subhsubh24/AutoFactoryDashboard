import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AutoFactoryDashboard",
    template: "%s · AutoFactoryDashboard",
  },
  description:
    "A single live view of autonomous product-factory projects shipping toward launch.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#17140f" },
  ],
};

// Runs before paint to avoid a flash of the wrong theme.
const themeInit = `(function(){try{var t=localStorage.getItem('afd-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

// Also before paint: if the intro already played this session (or motion is
// reduced), mark the doc so CSS hides the curtain with zero flash on reload.
const introInit = `(function(){try{var p=sessionStorage.getItem('afd-intro-played')==='1';var r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(p||r){document.documentElement.classList.add('intro-skip');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script dangerouslySetInnerHTML={{ __html: introInit }} />
      </head>
      <body className="grain min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
