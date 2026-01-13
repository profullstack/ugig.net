import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConversationList } from "@/components/messages";
import { Header } from "@/components/layout/Header";
import { MessageSquare } from "lucide-react";

export const metadata = {
  title: "Messages | ugig.net",
  description: "Your conversations",
};

export default async function MessagesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/messages");
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Messages</h1>
          </div>

          <div className="grid md:grid-cols-[350px_1fr] gap-6">
            {/* Conversation List */}
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold">Conversations</h2>
              </div>
              <ConversationList currentUserId={user.id} />
            </div>

            {/* Empty State for Desktop */}
            <div className="hidden md:flex bg-card rounded-lg border border-border items-center justify-center min-h-[500px]">
              <div className="text-center p-8">
                <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  Select a conversation
                </h3>
                <p className="text-muted-foreground">
                  Choose a conversation from the list to start chatting
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
