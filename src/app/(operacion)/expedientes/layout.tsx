import { AppShell } from "@/components/app-shell";

export default function ExpedientesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
