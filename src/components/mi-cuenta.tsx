"use client";

import { useState } from "react";
import { ChevronRightIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";

import { cambiarContrasena } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InputPassword } from "@/components/ui/input-password";
import { Label } from "@/components/ui/label";

// Ficha del usuario en el sidebar: abre «Mi cuenta» para cambiar la
// contraseña de la propia sesión (better-auth exige la actual).
export function MiCuenta({
  usuario,
}: {
  usuario: { nombre: string; email: string; nivel: string };
}) {
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const iniciales = usuario.nombre
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function limpiar() {
    setActual("");
    setNueva("");
    setConfirmacion("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (nueva !== confirmacion) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setGuardando(true);
    try {
      const result = await cambiarContrasena(actual, nueva);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAbierto(false);
      limpiar();
      toast.success("Contraseña actualizada");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(open) => {
        setAbierto(open);
        if (!open) limpiar();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
          title="Mi cuenta"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            {iniciales}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-medium">{usuario.nombre}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {usuario.email}
              <span className="ml-1 rounded bg-muted px-1 font-mono text-[10px]">
                {usuario.nivel}
              </span>
            </p>
          </div>
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4 text-muted-foreground" />
            Cambiar contraseña
          </DialogTitle>
          <DialogDescription>
            {usuario.nombre} · {usuario.email}. Al guardar se cierran las demás
            sesiones abiertas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pw-actual">Contraseña actual</Label>
            <InputPassword
              id="pw-actual"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw-nueva">Nueva contraseña</Label>
            <InputPassword
              id="pw-nueva"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw-confirmacion">Confirmar nueva contraseña</Label>
            <InputPassword
              id="pw-confirmacion"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAbierto(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
