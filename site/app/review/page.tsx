import { Logo } from "@/components/logo";
import { ReviewForm } from "@/components/review-form";

// The client's script review link: /review?t=<token>. Private: never indexed, never in the sitemap.
export const metadata = { title: "Script review | RUANGKOTAK", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <main className="mx-auto max-w-[860px] px-4 py-8 md:px-8 md:py-12">
      <div className="mb-10">
        <Logo className="h-[16px] w-auto" />
      </div>
      <ReviewForm token={typeof t === "string" ? t : ""} />
    </main>
  );
}
