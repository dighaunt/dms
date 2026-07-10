"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { postJson } from "@/lib/cliente-api";
import { cn } from "@/lib/utils";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type UsuarioFila = {
  id: number;
  email: string;
  nombre: string;
  nivel: "N1" | "N2" | "N3";
  activo: boolean;
};

const NIVELES = [
  { valor: "N1", etiqueta: "N1 · Operación" },
  { valor: "N2", etiqueta: "N2 · Supervisión" },
  { valor: "N3", etiqueta: "N3 · Administración global" },
] as const;

export function TablaUsuarios({
  usuarios,
  miId,
}: {
  usuarios: UsuarioFila[];
  miId: number;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<number | null>(null);

  async function actualizar(id: number, cambios: { nivel?: string; activo?: boolean }) {
    setOcupado(id);
    try {
      const res = await postJson<UsuarioFila>(`/api/usuarios/${id}`, cambios);
      if (!res) return;
      toast.success(
        cambios.nivel
          ? `${res.email} ahora es ${res.nivel}`
          : `${res.email} ${res.activo ? "activado" : "desactivado"}`,
      );
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DialogCrearUsuario onDone={() => router.refresh()} />
      </div>

      <div className="overflow-hidden rounded-lg border bg-background shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Usuario</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Nivel</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => {
              const soyYo = u.id === miId;
              return (
                <TableRow key={u.id} className={cn(!u.activo && "opacity-60")}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {u.nombre
                          .split(/\s+/)
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                      <span className="font-medium">
                        {u.nombre}
                        {soyYo && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            (tú)
                          </span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    {soyYo ? (
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                        {u.nivel}
                      </span>
                    ) : (
                      <Select
                        value={u.nivel}
                        onValueChange={(nivel) => actualizar(u.id, { nivel })}
                        disabled={ocupado === u.id}
                      >
                        <SelectTrigger size="sm" className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NIVELES.map((n) => (
                            <SelectItem key={n.valor} value={n.valor}>
                              {n.etiqueta}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          u.activo ? "bg-emerald-500" : "bg-zinc-400",
                        )}
                      />
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {!soyYo && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-7 px-2 text-xs",
                          u.activo && "text-destructive hover:text-destructive",
                        )}
                        disabled={ocupado === u.id}
                        onClick={() => actualizar(u.id, { activo: !u.activo })}
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DialogCrearUsuario({ onDone }: { onDone: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nivel, setNivel] = useState<string>("N1");
  const [enviando, setEnviando] = useState(false);

  const valido =
    nombre.trim().length > 0 && /\S+@\S+\.\S+/.test(email) && password.length >= 8;

  async function crear() {
    setEnviando(true);
    try {
      const res = await postJson<{ email: string; nivel: string }>("/api/usuarios", {
        email,
        nombre,
        password,
        nivel,
      });
      if (!res) return;
      toast.success(`Usuario ${res.email} creado con nivel ${res.nivel}`, {
        description: "Compártele su contraseña temporal por un canal seguro.",
      });
      setAbierto(false);
      setNombre("");
      setEmail("");
      setPassword("");
      setNivel("N1");
      onDone();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm">Crear usuario</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear usuario</DialogTitle>
          <DialogDescription>
            La cuenta se crea en Neon Auth con una contraseña temporal que tú
            defines; el nivel controla lo que puede autorizar en el sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nuevo-nombre">Nombre</Label>
            <Input
              id="nuevo-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="María Pérez"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nuevo-email">Correo</Label>
            <Input
              id="nuevo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@cliquealo.mx"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nuevo-password">Contraseña temporal</Label>
            <Input
              id="nuevo-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 8 caracteres"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label>Nivel</Label>
            <Select value={nivel} onValueChange={setNivel}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NIVELES.map((n) => (
                  <SelectItem key={n.valor} value={n.valor}>
                    {n.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={crear} disabled={!valido || enviando}>
            {enviando ? "Creando…" : "Crear usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
