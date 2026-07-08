import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { IntroCurtain } from "@/components/IntroCurtain";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Keyboard users skip the header (logo, theme toggle, sign-out) on every nav. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lift focus:outline-none focus:ring-2 focus:ring-clay"
      >
        Skip to main content
      </a>
      <IntroCurtain />
      <SiteHeader />
      <main
        id="main"
        className="relative z-10 mx-auto w-full max-w-shell flex-1 px-5 py-8"
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
