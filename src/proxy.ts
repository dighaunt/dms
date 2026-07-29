import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

// Protección de PÁGINAS: sin sesión → redirect a /login.
// Las rutas /api/* se excluyen del matcher a propósito: cada handler exige
// sesión con requerirUsuario() y responde 401 JSON (además, el middleware del
// SDK proxya get-session reutilizando el método de la petición original, lo
// que rompe los POST autenticados — bug reportable de @neondatabase/auth).
//
// El mismo bug alcanza también a las Server Actions: un formulario que hace
// `<form action={miAccion}>` en una página (no bajo /api/) hace un POST a esa
// MISMA ruta, y el matcher de abajo sí la protege. El proxy roto reenvía ese
// POST a get-session, que solo entiende GET, así que la sesión sale vacía y
// esta pieza redirige a /login aunque la cookie sea válida — así se vio en
// /finanzas/cortes: "This page couldn't load" al abrir el corte del día.
//
// Next.js marca toda petición de Server Action con la cabecera `next-action`,
// así que esas peticiones se dejan pasar aquí sin pedirle nada a este proxy:
// la acción en sí exige sesión con requerirUsuario(), que lee la cookie
// directo y no reutiliza el método de la petición.
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
