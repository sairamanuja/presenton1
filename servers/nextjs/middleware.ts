import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://localhost:8000";

export function middleware(request: NextRequest) {
  const backendUrl = process.env.INTERNAL_API_URL || DEFAULT_BACKEND_URL;
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/v1/") || pathname.startsWith("/app_data/")) {
    const targetUrl = new URL(backendUrl);
    targetUrl.pathname = pathname;
    targetUrl.search = search;
    return NextResponse.rewrite(targetUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/v1/:path*", "/app_data/:path*"],
};
