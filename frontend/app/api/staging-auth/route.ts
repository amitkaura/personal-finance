import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { hashPassword, COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/staging-auth";

export async function POST(request: NextRequest) {
  const password = process.env.STAGING_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "Not configured" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const submitted = body?.password;
  if (!submitted || typeof submitted !== "string") {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const submittedBuf = Buffer.from(submitted);
  const expectedBuf = Buffer.from(password);
  const match =
    submittedBuf.length === expectedBuf.length &&
    timingSafeEqual(submittedBuf, expectedBuf);

  if (!match) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = hashPassword(password);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}
