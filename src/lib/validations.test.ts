import { describe, it, expect } from "vitest";
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  profileSchema,
  gigSchema,
  gigFiltersSchema,
  applicationSchema,
  applicationStatusSchema,
  messageSchema,
  conversationCreateSchema,
} from "./validations";

describe("signupSchema", () => {
  it("validates correct signup data", () => {
    const validData = {
      email: "test@example.com",
      password: "Test1234",
      username: "testuser",
    };
    const result = signupSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const data = {
      email: "invalid-email",
      password: "Test1234",
      username: "testuser",
    };
    const result = signupSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid email address");
    }
  });

  it("rejects short password", () => {
    const data = {
      email: "test@example.com",
      password: "Test1",
      username: "testuser",
    };
    const result = signupSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects password without uppercase", () => {
    const data = {
      email: "test@example.com",
      password: "test1234",
      username: "testuser",
    };
    const result = signupSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects password without number", () => {
    const data = {
      email: "test@example.com",
      password: "TestTest",
      username: "testuser",
    };
    const result = signupSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects short username", () => {
    const data = {
      email: "test@example.com",
      password: "Test1234",
      username: "ab",
    };
    const result = signupSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects username with special characters", () => {
    const data = {
      email: "test@example.com",
      password: "Test1234",
      username: "test@user",
    };
    const result = signupSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("accepts username with underscore and hyphen", () => {
    const data = {
      email: "test@example.com",
      password: "Test1234",
      username: "test_user-123",
    };
    const result = signupSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("validates correct login data", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "anypassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("validates correct email", () => {
    const result = forgotPasswordSchema.safeParse({
      email: "test@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = forgotPasswordSchema.safeParse({
      email: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("validates strong password", () => {
    const result = resetPasswordSchema.safeParse({
      password: "NewPass123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects weak password", () => {
    const result = resetPasswordSchema.safeParse({
      password: "weak",
    });
    expect(result.success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("validates complete profile", () => {
    const result = profileSchema.safeParse({
      username: "testuser",
      full_name: "Test User",
      bio: "I am a developer",
      skills: ["JavaScript", "React"],
      ai_tools: ["ChatGPT"],
      hourly_rate: 50,
      portfolio_urls: ["https://example.com"],
      location: "New York",
      timezone: "America/New_York",
      is_available: true,
    });
    expect(result.success).toBe(true);
  });

  it("validates minimal profile", () => {
    const result = profileSchema.safeParse({
      username: "testuser",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid portfolio URL", () => {
    const result = profileSchema.safeParse({
      username: "testuser",
      portfolio_urls: ["not-a-url"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects too many skills", () => {
    const result = profileSchema.safeParse({
      username: "testuser",
      skills: Array(21).fill("skill"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative hourly rate", () => {
    const result = profileSchema.safeParse({
      username: "testuser",
      hourly_rate: -10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects hourly rate over max", () => {
    const result = profileSchema.safeParse({
      username: "testuser",
      hourly_rate: 1001,
    });
    expect(result.success).toBe(false);
  });
});

describe("gigSchema", () => {
  it("validates complete gig", () => {
    const result = gigSchema.safeParse({
      title: "Looking for React Developer",
      description:
        "We need an experienced React developer to help build our web application. Must have experience with TypeScript.",
      category: "Development",
      skills_required: ["React", "TypeScript"],
      ai_tools_preferred: ["ChatGPT"],
      budget_type: "hourly",
      budget_min: 50,
      budget_max: 100,
      duration: "1 month",
      location_type: "remote",
      location: "Anywhere",
    });
    expect(result.success).toBe(true);
  });

  it("rejects title too short", () => {
    const result = gigSchema.safeParse({
      title: "Short",
      description: "A long enough description for the gig posting requirements",
      category: "Development",
      skills_required: ["React"],
      ai_tools_preferred: [],
      budget_type: "fixed",
      location_type: "remote",
    });
    expect(result.success).toBe(false);
  });

  it("rejects description too short", () => {
    const result = gigSchema.safeParse({
      title: "Looking for Developer",
      description: "Short description",
      category: "Development",
      skills_required: ["React"],
      ai_tools_preferred: [],
      budget_type: "fixed",
      location_type: "remote",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty skills", () => {
    const result = gigSchema.safeParse({
      title: "Looking for Developer",
      description:
        "We need an experienced developer to help build our application",
      category: "Development",
      skills_required: [],
      ai_tools_preferred: [],
      budget_type: "fixed",
      location_type: "remote",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid budget types", () => {
    const fixed = gigSchema.safeParse({
      title: "Looking for Developer",
      description:
        "We need an experienced developer to help build our application",
      category: "Development",
      skills_required: ["React"],
      ai_tools_preferred: [],
      budget_type: "fixed",
      location_type: "remote",
    });
    const hourly = gigSchema.safeParse({
      title: "Looking for Developer",
      description:
        "We need an experienced developer to help build our application",
      category: "Development",
      skills_required: ["React"],
      ai_tools_preferred: [],
      budget_type: "hourly",
      location_type: "remote",
    });
    expect(fixed.success).toBe(true);
    expect(hourly.success).toBe(true);
  });

  it("accepts all location types", () => {
    const types = ["remote", "onsite", "hybrid"] as const;
    types.forEach((locationType) => {
      const result = gigSchema.safeParse({
        title: "Looking for Developer",
        description:
          "We need an experienced developer to help build our application",
        category: "Development",
        skills_required: ["React"],
        ai_tools_preferred: [],
        budget_type: "fixed",
        location_type: locationType,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("gigFiltersSchema", () => {
  it("validates empty filters", () => {
    const result = gigFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("validates complete filters", () => {
    const result = gigFiltersSchema.safeParse({
      search: "react",
      category: "Development",
      skills: ["React", "TypeScript"],
      budget_type: "hourly",
      budget_min: 50,
      budget_max: 200,
      location_type: "remote",
      sort: "newest",
      page: 1,
      limit: 20,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all sort options", () => {
    const sorts = ["newest", "oldest", "budget_high", "budget_low"] as const;
    sorts.forEach((sort) => {
      const result = gigFiltersSchema.safeParse({ sort });
      expect(result.success).toBe(true);
    });
  });
});

describe("applicationSchema", () => {
  it("validates complete application", () => {
    const result = applicationSchema.safeParse({
      gig_id: "123e4567-e89b-12d3-a456-426614174000",
      cover_letter:
        "I am very interested in this position and have extensive experience in the required skills. I would love to discuss further.",
      proposed_rate: 75,
      proposed_timeline: "2 weeks",
      portfolio_items: ["https://example.com/project1"],
      ai_tools_to_use: ["ChatGPT", "Copilot"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid gig_id", () => {
    const result = applicationSchema.safeParse({
      gig_id: "not-a-uuid",
      cover_letter:
        "I am very interested in this position and have extensive experience in the required skills.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short cover letter", () => {
    const result = applicationSchema.safeParse({
      gig_id: "123e4567-e89b-12d3-a456-426614174000",
      cover_letter: "Too short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid portfolio URL", () => {
    const result = applicationSchema.safeParse({
      gig_id: "123e4567-e89b-12d3-a456-426614174000",
      cover_letter:
        "I am very interested in this position and have extensive experience in the required skills.",
      portfolio_items: ["not-a-url"],
    });
    expect(result.success).toBe(false);
  });
});

describe("applicationStatusSchema", () => {
  it("validates all status types", () => {
    const statuses = [
      "pending",
      "reviewing",
      "shortlisted",
      "rejected",
      "accepted",
      "withdrawn",
    ] as const;
    statuses.forEach((status) => {
      const result = applicationStatusSchema.safeParse({ status });
      expect(result.success).toBe(true);
    });
  });

  it("rejects invalid status", () => {
    const result = applicationStatusSchema.safeParse({
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("messageSchema", () => {
  it("validates valid message content", () => {
    const result = messageSchema.safeParse({
      content: "Hello, this is a test message!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty message", () => {
    const result = messageSchema.safeParse({
      content: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Message is required");
    }
  });

  it("rejects message over 5000 characters", () => {
    const result = messageSchema.safeParse({
      content: "a".repeat(5001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Message must be at most 5000 characters"
      );
    }
  });

  it("accepts message at max length", () => {
    const result = messageSchema.safeParse({
      content: "a".repeat(5000),
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiline message", () => {
    const result = messageSchema.safeParse({
      content: "Line 1\nLine 2\nLine 3",
    });
    expect(result.success).toBe(true);
  });
});

describe("conversationCreateSchema", () => {
  it("validates valid conversation creation data", () => {
    const result = conversationCreateSchema.safeParse({
      gig_id: "123e4567-e89b-12d3-a456-426614174000",
      recipient_id: "987fcdeb-51a2-3bc4-a567-890123456789",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid gig_id", () => {
    const result = conversationCreateSchema.safeParse({
      gig_id: "not-a-uuid",
      recipient_id: "987fcdeb-51a2-3bc4-a567-890123456789",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid gig ID");
    }
  });

  it("rejects invalid recipient_id", () => {
    const result = conversationCreateSchema.safeParse({
      gig_id: "123e4567-e89b-12d3-a456-426614174000",
      recipient_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid recipient ID");
    }
  });

  it("accepts missing gig_id (direct message)", () => {
    const result = conversationCreateSchema.safeParse({
      recipient_id: "987fcdeb-51a2-3bc4-a567-890123456789",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing recipient_id", () => {
    const result = conversationCreateSchema.safeParse({
      gig_id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(false);
  });
});
