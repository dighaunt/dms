import "server-only";

import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export type UsuarioSesion = {
  id: number;
  email: string;
  nombre: string;
  nivel: "N1" | "N2" | "N3";
  activo: boolean;
};

export async function getUsuarioSesion(): Promise<UsuarioSesion | null> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user?.email) return null;

  const email = user.email.toLowerCase();
  const nombre = user.name || email;

  const { rows } = await query<UsuarioSesion>(
    `INSERT INTO traza.usuario (email, nombre, nivel)
     VALUES ($1, $2, 'N1')
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id::int AS id, email, nombre, nivel, activo`,
    [email, nombre],
  );
  const usuario = rows[0];
  if (!usuario?.activo) return null;
  return usuario;
}
