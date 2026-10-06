import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

export async function POST(request: NextRequest) {
  // Session or full-access API key. API-key auth uses the service client, so
  // the participant check below is what scopes access, not RLS.
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, supabase } = auth;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const conversationId = formData.get("conversationId") as string | null;

  if (!file || !conversationId) {
    return NextResponse.json(
      { error: "file and conversationId are required" },
      { status: 400 }
    );
  }

  // Validate file size — max 10MB (#79)
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File size exceeds 10MB limit" },
      { status: 400 }
    );
  }

  // Validate file type against allowlist (#79)
  const ALLOWED_TYPES = [
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
    "text/plain", "text/csv", "text/markdown",
    "application/json",
    "application/zip", "application/gzip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `File type '${file.type}' is not allowed` },
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
  } = supabase.storage.from("attachments").getPublicUrl(path, {
    download: file.name, // Serve with Content-Disposition: attachment (#79)
  });

  return NextResponse.json({
    url: publicUrl,
    filename: file.name,
    size: file.size,
    type: file.type,
  });
}
