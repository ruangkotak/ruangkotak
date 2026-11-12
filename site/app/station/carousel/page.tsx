import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Carousel } from "@/components/station/carousel";
import { COOKIE } from "@/lib/station";
import { scopeOf } from "@/lib/station-live";
import "../station.css";

// The carousel studio. Owner only: a 404 to clients and to anyone without the session cookie. Never indexed.
export const metadata = { title: "KNOX Carousel studio | RUANGKOTAK", robots: { index: false, follow: false } };

export default async function CarouselPage() {
  const scope = await scopeOf({ cookie: (await cookies()).get(COOKIE)?.value });
  if (scope?.kind !== "owner") notFound();
  return <Carousel />;
}
