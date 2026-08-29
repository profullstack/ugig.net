import { Header } from "@/components/layout/Header";

export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}
