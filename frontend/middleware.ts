import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "staging-auth";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function middleware(request: NextRequest) {
  const password = process.env.STAGING_PASSWORD;
  if (!password) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token && token.length === 64) {
    const expected = await sha256Hex(password);
    if (constantTimeEqual(token, expected)) return NextResponse.next();
  }

  const loginUrl = new URL("/staging-login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!staging-login|api/staging-auth|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
