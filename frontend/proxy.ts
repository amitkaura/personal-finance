import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/staging-auth";

export async function proxy(request: NextRequest) {
  const password = process.env.STAGING_PASSWORD;
  if (!password) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token && verifyToken(token, password)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/staging-login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!staging-login|api/|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
