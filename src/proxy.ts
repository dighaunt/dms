import { auth } from "@/lib/auth";

// Protección de PÁGINAS: sin sesión → redirect a /login.
// Las rutas /api/* se excluyen del matcher a propósito: cada handler exige
// sesión con requerirUsuario() y responde 401 JSON (además, el middleware del
// SDK proxya get-session reutilizando el método de la petición original, lo
// que rompe los POST autenticados — bug reportable de @neondatabase/auth).
export default auth.middleware({ loginUrl: "/login" });

export const config = {
  matcher: [
    "/((?!login|api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webp)$).*)",
  ],
};
