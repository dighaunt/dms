import { AppShell } from "@/components/app-shell";

export default function FinanzasLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
