import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = signupSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password, username } = validationResult.data;
    const supabase = await createClient();

    // Check if username is already taken
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 400 }
      );
    }

    // Create the user with username in metadata
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: "Check your email to confirm your account",
      user: data.user,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
