import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="relative z-10 mx-auto w-full max-w-shell flex-1 px-5 py-8">
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
