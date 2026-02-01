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
  createApiKeySchema,
  revokeApiKeySchema,
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

describe("signupSchema - agent accounts", () => {
  it("validates agent signup with agent_name", () => {
    const result = signupSchema.safeParse({
      email: "bot@example.com",
      password: "Agent1234",
      username: "my-agent",
      account_type: "agent",
      agent_name: "My AI Agent",
    });
    expect(result.success).toBe(true);
  });

  it("rejects agent signup without agent_name", () => {
    const result = signupSchema.safeParse({
      email: "bot@example.com",
      password: "Agent1234",
      username: "my-agent",
      account_type: "agent",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "agent_name is required for agent accounts"
      );
    }
  });

  it("accepts human signup without agent_name", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "Human1234",
      username: "humanuser",
      account_type: "human",
    });
    expect(result.success).toBe(true);
  });

  it("defaults account_type to human", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "Human1234",
      username: "humanuser",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid account_type", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "Human1234",
      username: "humanuser",
      account_type: "robot",
    });
    expect(result.success).toBe(false);
  });

  it("validates agent with all optional fields", () => {
    const result = signupSchema.safeParse({
      email: "bot@example.com",
      password: "Agent1234",
      username: "full-agent",
      account_type: "agent",
      agent_name: "Full Agent",
      agent_description: "A fully configured agent",
      agent_version: "1.0.0",
      agent_operator_url: "https://operator.example.com",
      agent_source_url: "https://github.com/example/agent",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid agent_operator_url", () => {
    const result = signupSchema.safeParse({
      email: "bot@example.com",
      password: "Agent1234",
      username: "my-agent",
      account_type: "agent",
      agent_name: "My Agent",
      agent_operator_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("profileSchema - agent fields", () => {
  it("validates profile with agent fields", () => {
    const result = profileSchema.safeParse({
      username: "agentuser",
      agent_name: "My Agent",
      agent_description: "Does cool things",
      agent_version: "2.0",
      agent_operator_url: "https://operator.example.com",
      agent_source_url: "https://github.com/example/agent",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null agent fields", () => {
    const result = profileSchema.safeParse({
      username: "humanuser",
      agent_name: null,
      agent_description: null,
      agent_version: null,
      agent_operator_url: null,
      agent_source_url: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("gigFiltersSchema - account_type", () => {
  it("accepts account_type filter", () => {
    const result = gigFiltersSchema.safeParse({
      account_type: "agent",
    });
    expect(result.success).toBe(true);
  });

  it("accepts human account_type filter", () => {
    const result = gigFiltersSchema.safeParse({
      account_type: "human",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid account_type", () => {
    const result = gigFiltersSchema.safeParse({
      account_type: "robot",
    });
    expect(result.success).toBe(false);
  });
});

describe("createApiKeySchema", () => {
  it("validates a valid API key name", () => {
    const result = createApiKeySchema.safeParse({
      name: "My Production Key",
    });
    expect(result.success).toBe(true);
  });

  it("validates with optional expires_at", () => {
    const result = createApiKeySchema.safeParse({
      name: "Temporary Key",
      expires_at: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createApiKeySchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    const result = createApiKeySchema.safeParse({
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid expires_at format", () => {
    const result = createApiKeySchema.safeParse({
      name: "Key",
      expires_at: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});

describe("revokeApiKeySchema", () => {
  it("validates a valid UUID", () => {
    const result = revokeApiKeySchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = revokeApiKeySchema.safeParse({
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
