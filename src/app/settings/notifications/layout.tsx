import { Header } from "@/components/layout/Header";

export const metadata = {
  title: "Notification Settings | ugig.net",
  description: "Manage your email notification preferences",
};

export default function NotificationSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main>{children}</main>
    </>
  );
}
