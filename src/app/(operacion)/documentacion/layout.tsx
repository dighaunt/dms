import { AppShell } from "@/components/app-shell";

export default function DocumentacionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
