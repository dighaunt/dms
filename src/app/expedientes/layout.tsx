import { AppHeader } from "@/components/app-header";

export default function ExpedientesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
