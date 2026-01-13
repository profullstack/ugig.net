import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseResumeFile } from "@/lib/resume-parser";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload a PDF or Word document." },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    // Parse the file
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseResumeFile(buffer, file.type);

    // Update profile with parsed data (only non-null values)
    const profileUpdates: Record<string, unknown> = {};

    if (parsed.full_name) {
      profileUpdates.full_name = parsed.full_name;
    }
    if (parsed.bio) {
      profileUpdates.bio = parsed.bio;
    }
    if (parsed.skills && parsed.skills.length > 0) {
      profileUpdates.skills = parsed.skills;
    }
    if (parsed.location) {
      profileUpdates.location = parsed.location;
    }

    // Update profile if we have any data
    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("id", user.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }
    }

    // Insert work history entries
    const insertedWorkHistory = [];
    if (parsed.work_history && parsed.work_history.length > 0) {
      // First, mark all existing as not current if we're importing current positions
      const hasCurrentPosition = parsed.work_history.some((wh) => wh.is_current);
      if (hasCurrentPosition) {
        await supabase
          .from("work_history")
          .update({ is_current: false })
          .eq("user_id", user.id)
          .eq("is_current", true);
      }

      for (const wh of parsed.work_history) {
        if (wh.company && wh.position && wh.start_date) {
          const { data, error } = await supabase
            .from("work_history")
            .insert({
              user_id: user.id,
              company: wh.company,
              position: wh.position,
              description: wh.description,
              start_date: wh.start_date,
              end_date: wh.end_date,
              is_current: wh.is_current,
              location: wh.location,
            })
            .select()
            .single();

          if (!error && data) {
            insertedWorkHistory.push(data);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported: {
        profile: Object.keys(profileUpdates).length > 0,
        full_name: parsed.full_name,
        bio: parsed.bio ? true : false,
        skills_count: parsed.skills?.length || 0,
        location: parsed.location,
        work_history_count: insertedWorkHistory.length,
      },
      work_history: insertedWorkHistory,
    });
  } catch (error) {
    console.error("Resume import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse file" },
      { status: 500 }
    );
  }
}
