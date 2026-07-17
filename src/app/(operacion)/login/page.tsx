"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/animate-ui/components/buttons/button";
import { BlurFade } from "@/components/ui/blur-fade";
import { Input } from "@/components/ui/input";
import { InputPassword } from "@/components/ui/input-password";
import { Label } from "@/components/ui/label";
import { iniciarSesion } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type ErroresCampos = {
  email?: string;
  password?: string;
};

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recordar, setRecordar] = useState(false);
  const [erroresCampos, setErroresCampos] = useState<ErroresCampos>({});
  const [credencialesInvalidas, setCredencialesInvalidas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  function validarFormulario() {
    const errores: ErroresCampos = {};
    const correo = email.trim();

    if (!correo) {
      errores.email = "Ingresa tu correo electrónico.";
    } else if (!EMAIL_VALIDO.test(correo)) {
      errores.email = "Ingresa un correo electrónico válido.";
    }

    if (!password) {
      errores.password = "Ingresa tu contraseña.";
    }

    setErroresCampos(errores);

    if (errores.email) {
      emailRef.current?.focus();
    } else if (errores.password) {
      passwordRef.current?.focus();
    }

    return Object.keys(errores).length === 0;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCredencialesInvalidas(false);

    if (!validarFormulario()) return;

    setCargando(true);

    try {
      const result = await iniciarSesion(email.trim(), password, recordar);
      if (!result.ok) {
        setCredencialesInvalidas(true);
        setError("Correo o contraseña incorrectos. Verifica tus datos.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError(
        "No pudimos verificar tu acceso. Revisa tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="grid min-h-svh bg-white lg:grid-cols-2">
      <section className="flex min-h-svh flex-col px-6 py-8 sm:px-10 lg:px-14 xl:px-20">
        <Image
          src="/brand/kuentra-logo.svg"
          alt="Kuentra"
          width={1045}
          height={435}
          priority
          className="h-auto w-24 sm:w-28"
        />

        <div className="flex flex-1 items-center justify-center py-12">
          <form
            onSubmit={onSubmit}
            noValidate
            aria-busy={cargando}
            aria-describedby={error ? "login-error" : undefined}
            className="w-full max-w-[28rem]"
          >
            <BlurFade delay={0.04} offset={8}>
              <h1 className="mb-9 text-3xl font-semibold tracking-[-0.035em] text-[#011c4a] sm:text-[2.15rem] sm:leading-tight">
                Ingresa tu contraseña para iniciar sesión
              </h1>
            </BlurFade>

            <div className="space-y-5">
              <BlurFade delay={0.1} offset={8}>
                <div className="space-y-2.5">
                  <Label htmlFor="email" className="text-sm text-slate-700">
                    Correo electrónico
                  </Label>
                  <Input
                    ref={emailRef}
                    id="email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setError(null);
                      setCredencialesInvalidas(false);
                      setErroresCampos((actuales) => ({
                        ...actuales,
                        email: undefined,
                      }));
                    }}
                    placeholder="nombre@empresa.com"
                    required
                    autoFocus
                    autoComplete="email"
                    disabled={cargando}
                    aria-invalid={Boolean(
                      erroresCampos.email || credencialesInvalidas,
                    )}
                    aria-describedby={
                      erroresCampos.email ? "email-error" : undefined
                    }
                    className={cn(
                      "h-12 rounded-xl border-slate-200 bg-white px-4 text-[0.95rem] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-[#004ffe]/60 focus-visible:ring-[#004ffe]/12",
                      (erroresCampos.email || credencialesInvalidas) &&
                        "border-red-400 shadow-[0_0_0_3px_rgba(239,68,68,0.10)] focus-visible:border-red-500 focus-visible:ring-red-500/20",
                    )}
                  />
                  <AnimatePresence initial={false}>
                    {erroresCampos.email && (
                      <motion.p
                        id="email-error"
                        role="alert"
                        initial={{ opacity: 0, y: -4, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        className="overflow-hidden text-xs font-medium text-red-600"
                      >
                        {erroresCampos.email}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </BlurFade>

              <BlurFade delay={0.16} offset={8}>
                <div className="space-y-2.5">
                  <Label htmlFor="password" className="text-sm text-slate-700">
                    Contraseña
                  </Label>
                  <InputPassword
                    ref={passwordRef}
                    id="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError(null);
                      setCredencialesInvalidas(false);
                      setErroresCampos((actuales) => ({
                        ...actuales,
                        password: undefined,
                      }));
                    }}
                    placeholder="Ingresa tu contraseña"
                    required
                    autoComplete="current-password"
                    disabled={cargando}
                    aria-invalid={Boolean(
                      erroresCampos.password || credencialesInvalidas,
                    )}
                    aria-describedby={
                      erroresCampos.password ? "password-error" : undefined
                    }
                    className={cn(
                      "h-12 rounded-xl border-slate-200 bg-white px-4 pr-11 text-[0.95rem] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-[#004ffe]/60 focus-visible:ring-[#004ffe]/12",
                      (erroresCampos.password || credencialesInvalidas) &&
                        "border-red-400 shadow-[0_0_0_3px_rgba(239,68,68,0.10)] focus-visible:border-red-500 focus-visible:ring-red-500/20",
                    )}
                  />
                  <AnimatePresence initial={false}>
                    {erroresCampos.password && (
                      <motion.p
                        id="password-error"
                        role="alert"
                        initial={{ opacity: 0, y: -4, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        className="overflow-hidden text-xs font-medium text-red-600"
                      >
                        {erroresCampos.password}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </BlurFade>

              <BlurFade delay={0.19} offset={8}>
                <label className="flex select-none items-center gap-2.5 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={recordar}
                    onChange={(event) => setRecordar(event.target.checked)}
                    disabled={cargando}
                    className="size-4 rounded border-slate-300 accent-[#004ffe]"
                  />
                  Mantener la sesión iniciada por 7 días
                </label>
              </BlurFade>

              <AnimatePresence initial={false} mode="popLayout">
                {error && (
                  <motion.div
                    id="login-error"
                    role="alert"
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -4, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-2.5 overflow-hidden rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700"
                  >
                    <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <BlurFade delay={0.22} offset={8}>
                <Button
                  type="submit"
                  size="lg"
                  hoverScale={cargando ? 1 : 1.012}
                  tapScale={cargando ? 1 : 0.985}
                  disabled={cargando}
                  className="relative h-12 w-full overflow-hidden rounded-xl bg-[#004ffe] text-[0.95rem] font-semibold text-white shadow-[0_8px_20px_rgba(0,79,254,0.18)] hover:bg-[#0046e5] disabled:opacity-80"
                >
                  <AnimatePresence initial={false} mode="wait">
                    {cargando ? (
                      <motion.span
                        key="loading"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="flex items-center gap-2"
                      >
                        <LoaderCircleIcon className="size-4 animate-spin" />
                        Verificando acceso…
                      </motion.span>
                    ) : (
                      <motion.span
                        key="ready"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                      >
                        Iniciar sesión
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </BlurFade>
            </div>
          </form>
        </div>
      </section>

      <section className="hidden min-h-svh items-center justify-center bg-white px-8 py-12 lg:flex xl:px-16">
        <div className="relative aspect-square w-full max-w-[20rem]">
          <Image
            src="/brand/document-splash.png"
            alt="Ilustración de documentos organizados en un archivo"
            fill
            priority
            sizes="50vw"
            className="object-contain"
          />
        </div>
      </section>
    </main>
  );
}
