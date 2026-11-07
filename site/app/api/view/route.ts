import { track } from "@/lib/track";

// Counts one homepage view per call (an aggregate number per day, nothing about the visitor is stored).
// Only same-origin calls count, so other sites and scripted hits without browser headers can't inflate it.
export async function POST(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 204 });
  await track("home_view");
  return new Response(null, { status: 204 });
}
