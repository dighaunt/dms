"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "registro">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const result =
        modo === "entrar"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: nombre });
      if (result.error) {
        setError(result.error.message ?? "No se pudo iniciar sesión.");
        return;
      }
      router.push("/expedientes");
      router.refresh();
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">
            CLIQUEALO · Trazabilidad documental
          </CardTitle>
          <CardDescription>
            {modo === "entrar"
              ? "Inicia sesión para acceder a los expedientes."
              : "Crea tu cuenta (nivel N1 por defecto)."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-4">
            {modo === "registro" && (
              <div className="grid gap-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={
                  modo === "entrar" ? "current-password" : "new-password"
                }
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={cargando}>
              {cargando
                ? "Un momento…"
                : modo === "entrar"
                  ? "Entrar"
                  : "Crear cuenta"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setError(null);
                setModo(modo === "entrar" ? "registro" : "entrar");
              }}
            >
              {modo === "entrar"
                ? "¿Sin cuenta? Regístrate"
                : "¿Ya tienes cuenta? Inicia sesión"}
            </button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
