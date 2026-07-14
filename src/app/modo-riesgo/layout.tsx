import { AppShell } from "@/components/app-shell";

export default function ModoRiesgoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
