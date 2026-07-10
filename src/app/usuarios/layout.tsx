import { AppShell } from "@/components/app-shell";

export default function UsuariosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
