import { ScanExperience } from "@/components/scan-experience";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-10">
        <ScanExperience />
      </main>
      <SiteFooter />
    </div>
  );
}
