import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConversationList, MessageThread } from "@/components/messages";
import { Header } from "@/components/layout/Header";
import { MessageSquare } from "lucide-react";

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export async function generateMetadata({ params }: ConversationPageProps) {
  const { conversationId } = await params;
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      `
      gig:gigs (title)
    `
    )
    .eq("id", conversationId)
    .single();

  return {
    title: conversation?.gig?.title
      ? `${conversation.gig.title} | Messages | ugig.net`
      : "Messages | ugig.net",
  };
}

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/dashboard/messages/${conversationId}`);
  }

  // Fetch conversation with participants and gig
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select(
      `
      *,
      gig:gigs (
        id,
        title
      )
    `
    )
    .eq("id", conversationId)
    .single();

  if (error || !conversation) {
    notFound();
  }

  // Verify user is a participant
  if (!conversation.participant_ids.includes(user.id)) {
    notFound();
  }

  // Fetch participant profiles
  const { data: participants } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", conversation.participant_ids);

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
            {/* Conversation List - Hidden on mobile when viewing a conversation */}
            <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold">Conversations</h2>
              </div>
              <ConversationList currentUserId={user.id} />
            </div>

            {/* Message Thread */}
            <div className="bg-card rounded-lg border border-border overflow-hidden h-[600px] flex flex-col">
              <MessageThread
                conversationId={conversationId}
                currentUserId={user.id}
                participants={participants || []}
                gig={conversation.gig}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
