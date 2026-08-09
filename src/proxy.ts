import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

const proteger = auth.middleware({ loginUrl: "/login" });

export default function proxy(request: NextRequest) {
  if (request.method === "POST" && request.headers.has("next-action")) {
    return NextResponse.next();
  }
  return proteger(request);
}

export const config = {
  matcher: [
    "/((?!login|api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webp)$).*)",
  ],
};
