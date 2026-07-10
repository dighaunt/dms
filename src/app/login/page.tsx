"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { iniciarSesion } from "@/lib/auth/client";
import { BlurFade } from "@/components/ui/blur-fade";
import { DotPattern } from "@/components/ui/dot-pattern";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputPassword } from "@/components/ui/input-password";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const result = await iniciarSesion(email, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/expedientes");
      router.refresh();
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-muted/40 px-4">
      <DotPattern
        className={cn(
          "text-neutral-300/70",
          "[mask-image:radial-gradient(480px_circle_at_center,white,transparent)]",
        )}
      />
      <BlurFade delay={0.1} className="relative w-full max-w-sm">
        <Card className="w-full shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">
            CLIQUEALO · Trazabilidad documental
          </CardTitle>
          <CardDescription>
            Acceso solo para personal autorizado. Las cuentas las asigna el
            administrador.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-4">
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
              <InputPassword
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-6">
            <Button type="submit" className="w-full" disabled={cargando}>
              {cargando ? "Un momento…" : "Entrar"}
            </Button>
          </CardFooter>
        </form>
        </Card>
      </BlurFade>
    </main>
  );
}
