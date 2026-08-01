import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ConversationList } from "@/components/messages";
import { Button } from "@/components/ui/button";
import { MessageSquare, Megaphone } from "lucide-react";

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
    <div>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-xl">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Messages</h1>
                <p className="text-muted-foreground text-sm">Chat with gig posters and applicants</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/messages/broadcast">
                <Megaphone className="h-4 w-4 mr-2" />
                Broadcast
              </Link>
            </Button>
          </div>

          <div className="grid md:grid-cols-[350px_1fr] gap-6">
            {/* Conversation List */}
            <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30">
                <h2 className="font-semibold">Conversations</h2>
              </div>
              <ConversationList currentUserId={user.id} />
            </div>

            {/* Empty State for Desktop */}
            <div className="hidden md:flex bg-card rounded-lg border border-border shadow-sm items-center justify-center min-h-[500px]">
              <div className="text-center p-8">
                <div className="p-4 bg-muted/30 rounded-full w-fit mx-auto mb-4">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
                </div>
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
