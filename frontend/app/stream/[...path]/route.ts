import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/**
 * Streaming proxy for NDJSON endpoints.
 *
 * Next.js rewrites buffer the full response body before forwarding,
 * which breaks streaming. This route handler pipes the backend
 * ReadableStream directly to the client without buffering.
 *
 * Placed under /stream/ (not /api/) so it doesn't conflict with the
 * catch-all /api/:path* rewrite in next.config.ts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const backendPath = `/api/v1/${path.join("/")}`;
  const url = `${BACKEND_URL}${backendPath}`;

  const cookie = request.headers.get("cookie") || "";

  // #region agent log
  console.log(`[DEBUG ff3a38] stream-proxy: url=${url}`);
  // #endregion

  const backendRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("content-type") || "application/json",
      Accept: request.headers.get("accept") || "application/x-ndjson",
      Cookie: cookie,
    },
    body: request.body,
    // @ts-expect-error -- Node fetch supports duplex for streaming request bodies
    duplex: "half",
  });

  // #region agent log
  console.log(`[DEBUG ff3a38] stream-proxy: backend status=${backendRes.status}, has_body=${!!backendRes.body}`);
  // #endregion

  if (!backendRes.ok || !backendRes.body) {
    const text = await backendRes.text();
    // #region agent log
    console.log(`[DEBUG ff3a38] stream-proxy: error response text=${text.substring(0, 200)}`);
    // #endregion
    return new Response(text, {
      status: backendRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(backendRes.body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
