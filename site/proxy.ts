import { NextResponse, type NextRequest } from "next/server";
import { markdownResponseFor, prefersMarkdown } from "@/lib/site";

function safeDecode(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

// Markdown content negotiation for agents: same URLs, `Accept: text/markdown` gets Markdown, everything else gets the normal HTML.
// Unknown paths get a Markdown 404 (status stays 404). Vary: Accept goes on both, so caches keep the two apart.
export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (prefersMarkdown(request.headers.get("accept"))) {
    const { status, body } = markdownResponseFor(safeDecode(pathname));
    return new NextResponse(request.method === "HEAD" ? null : body, {
      status,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        Vary: "Accept",
        "Cache-Control": "public, max-age=0, s-maxage=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const res = NextResponse.next();
  res.headers.append("Vary", "Accept");
  return res;
}

// Pages only: not the API, report links, static assets (anything with a file extension), or the static SPACE STACK page.
export const config = {
  matcher: ["/((?!api/|_next/|r/|space-stack|.*\\..*).*)"],
};
