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

    // Log what was parsed for debugging
    console.log("Resume parsed:", {
      full_name: parsed.full_name,
      bio: parsed.bio ? `${parsed.bio.slice(0, 100)}...` : null,
      skills_count: parsed.skills?.length || 0,
      skills_sample: parsed.skills?.slice(0, 5),
      work_history_count: parsed.work_history?.length || 0,
      work_history_sample: parsed.work_history?.slice(0, 2).map(w => ({
        company: w.company,
        position: w.position,
        start_date: w.start_date,
      })),
      location: parsed.location,
    });

    // Also log if no work history was found to help debug
    if (parsed.work_history?.length === 0) {
      console.log("No work history extracted. Check if 'Experience' section exists in the text.");
    }

    // Upload resume file to storage
    const fileExt = file.name.split(".").pop() || "pdf";
    const fileName = `${user.id}/resume.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    let resumeUrl: string | null = null;
    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(fileName);
      resumeUrl = urlData.publicUrl;
    } else {
      console.error("Error uploading resume:", uploadError);
    }

    // Update profile with parsed data (only non-null values)
    const profileUpdates: Record<string, unknown> = {};

    // Always store resume info if uploaded successfully
    if (resumeUrl) {
      profileUpdates.resume_url = resumeUrl;
      profileUpdates.resume_filename = file.name;
    }

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
      profileUpdates.updated_at = new Date().toISOString();
      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("id", user.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }
    }

    // Return parsed work history for user to review/edit before saving
    // Work history is NOT automatically inserted - user must save manually
    return NextResponse.json({
      success: true,
      imported: {
        profile: Object.keys(profileUpdates).length > 0,
        full_name: parsed.full_name,
        bio: parsed.bio ? true : false,
        skills_count: parsed.skills?.length || 0,
        skills: parsed.skills?.slice(0, 10) || [],
        location: parsed.location,
        work_history_count: parsed.work_history?.length || 0,
        resume_url: resumeUrl,
      },
      // Return parsed work history for editing (not yet saved)
      parsed_work_history: parsed.work_history || [],
      // Debug info - remove in production
      _debug: {
        work_history_entries: parsed.work_history?.length || 0,
        work_history_sample: parsed.work_history?.slice(0, 2) || [],
        text_length: parsed._debug?.text_length || 0,
        text_preview: parsed._debug?.text_preview || "",
        has_experience_section: parsed._debug?.has_experience_section || false,
      },
    });
  } catch (error) {
    console.error("Resume import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse file" },
      { status: 500 }
    );
  }
}
