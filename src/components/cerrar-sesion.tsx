"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon, LogOutIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/animate-ui/components/buttons/button";
import { cerrarSesion } from "@/lib/auth/client";

export function CerrarSesion() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function onCerrarSesion() {
    setCargando(true);

    try {
      await cerrarSesion();
      router.push("/login");
      router.refresh();
    } finally {
      setCargando(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      hoverScale={cargando ? 1 : 1.01}
      tapScale={cargando ? 1 : 0.98}
      disabled={cargando}
      aria-busy={cargando}
      className="w-full justify-start gap-2 text-muted-foreground"
      onClick={onCerrarSesion}
    >
      <AnimatePresence initial={false} mode="wait">
        {cargando ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            className="flex items-center gap-2"
          >
            <LoaderCircleIcon className="size-4 animate-spin" />
            Cerrando sesión…
          </motion.span>
        ) : (
          <motion.span
            key="ready"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            className="flex items-center gap-2"
          >
            <LogOutIcon className="size-4" />
            Cerrar sesión
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
