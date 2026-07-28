"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { normalizarTokenSello } from "@/lib/finanzas/formato";

type SelloVerificado = {
  token: string;
  leyenda: string;
  folio: string;
  folioCompleto: string;
  nombreTipo: string;
  sucursalClave: string;
  estadoDocumento: string;
  rolEtiqueta: string | null;
  estampadoPorNombre: string;
  estampadoEn: string;
};

/**
 * Verificación de un sello de tinta por su token.
 *
 * El dígito verificador se comprueba en el navegador ANTES de consultar: un
 * token mal transcrito del papel se corrige ahí mismo, sin viaje al servidor
 * y sin decirle a nadie si ese folio existe o no.
 */
export function VerificadorSello() {
  const [token, setToken] = useState("");
  const [estado, setEstado] = useState<"vacio" | "buscando" | "malformado" | "inexistente" | "ok">(
    "vacio",
  );
  const [sello, setSello] = useState<SelloVerificado | null>(null);

  async function verificar(evento: React.FormEvent) {
    evento.preventDefault();
    const normalizado = normalizarTokenSello(token);

    if (normalizado === null) {
      setSello(null);
      setEstado("malformado");
      return;
    }

    setEstado("buscando");
    const respuesta = await fetch(`/api/finanzas/sellos/${encodeURIComponent(normalizado)}`);
    if (!respuesta.ok) {
      setSello(null);
      setEstado("inexistente");
      return;
    }
    setSello((await respuesta.json()) as SelloVerificado);
    setEstado("ok");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificar un sello</CardTitle>
        <CardDescription>
          Teclea el token impreso dentro del cuño para comprobar a qué folio, acción y persona
          corresponde.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={verificar} className="flex flex-wrap gap-2">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="CACM-XXXX-XXXX-XXXX"
            className="max-w-xs font-mono uppercase"
            aria-label="Token del sello"
          />
          <Button type="submit" disabled={estado === "buscando"}>
            {estado === "buscando" ? "Verificando…" : "Verificar"}
          </Button>
        </form>

        {estado === "malformado" && (
          <p className="text-sm text-destructive">
            Ese token no está bien escrito. Revísalo: el dígito verificador no coincide, así que hay
            al menos un carácter mal transcrito.
          </p>
        )}

        {estado === "inexistente" && (
          <p className="text-sm text-destructive">
            El token está bien formado pero no corresponde a ningún sello emitido.
          </p>
        )}

        {estado === "ok" && sello && (
          <div className="space-y-1 rounded-md border p-4 text-sm">
            <p className="flex items-center gap-2">
              <Badge>{sello.leyenda}</Badge>
              <span className="font-mono">{sello.folioCompleto}</span>
            </p>
            <p className="text-muted-foreground">{sello.nombreTipo}</p>
            <p>
              {sello.rolEtiqueta ?? "Sello del documento"} · {sello.estampadoPorNombre}
            </p>
            <p className="text-muted-foreground">
              {new Date(sello.estampadoEn).toLocaleString("es-MX")} · documento{" "}
              {sello.estadoDocumento}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
