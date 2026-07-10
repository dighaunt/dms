import { auth } from "@/lib/auth";

// Toda ruta exige sesión; sin sesión → redirect a /login.
// Se excluyen del matcher: /login, el handler de auth y los assets estáticos.
export default auth.middleware({ loginUrl: "/login" });

export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webp)$).*)",
  ],
};
