import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const conversationId = formData.get("conversationId") as string | null;

  if (!file || !conversationId) {
    return NextResponse.json(
      { error: "file and conversationId are required" },
      { status: 400 }
    );
  }

  // Verify user is a participant of this conversation
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("participant_ids")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  if (!conversation.participant_ids.includes(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uniqueName = `${crypto.randomUUID()}-${file.name}`;
  const path = `${user.id}/${conversationId}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("attachments").getPublicUrl(path);

  return NextResponse.json({
    url: publicUrl,
    filename: file.name,
    size: file.size,
    type: file.type,
  });
}
