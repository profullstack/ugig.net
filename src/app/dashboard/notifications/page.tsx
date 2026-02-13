import { Header } from "@/components/layout/Header";
import { NotificationsList } from "@/components/notifications/NotificationsList";

export const metadata = {
  title: "Notifications | ugig.net",
  description: "Your notifications",
};

export default function NotificationsPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <NotificationsList />
      </main>
    </div>
  );
}
