import { extractText } from "unpdf";
import mammoth from "mammoth";
import OpenAI from "openai";

export interface ParsedWorkHistory {
  company: string;
  position: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  location: string | null;
}

export interface ParsedContact {
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  twitter_url: string | null;
}

export interface ParsedResumeProfile {
  full_name: string | null;
  bio: string | null;
  skills: string[];
  work_history: ParsedWorkHistory[];
  location: string | null;
  contact: ParsedContact;
  _debug?: {
    text_length: number;
    text_preview: string;
    has_experience_section: boolean;
  };
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Use OpenAI to parse resume text into structured data
async function parseWithOpenAI(text: string): Promise<ParsedResumeProfile> {
  const prompt = `Parse this resume text and extract structured information. Return a JSON object with the following fields:

{
  "full_name": "string or null - the person's full name",
  "bio": "string or null - professional summary or about section (max 500 chars)",
  "skills": ["array of skill strings - technical skills, tools, languages"],
  "location": "string or null - city, state/country",
  "contact": {
    "email": "email address or null",
    "phone": "phone number or null",
    "website": "personal website URL or null",
    "linkedin_url": "LinkedIn profile URL or null",
    "github_url": "GitHub profile URL or null",
    "twitter_url": "Twitter/X profile URL or null"
  },
  "work_history": [
    {
      "company": "company name",
      "position": "job title",
      "description": "bullet points of responsibilities/achievements (max 500 chars) or null",
      "start_date": "YYYY-MM-01 format",
      "end_date": "YYYY-MM-01 format or null if current",
      "is_current": true/false,
      "location": "job location or null"
    }
  ]
}

Important:
- For dates, convert month names to numbers (Jan=01, Feb=02, etc.)
- If only a year is given, use January (YYYY-01-01)
- Mark is_current as true for "Present", "Current", "Ongoing", or "Part-time" end dates
- Extract all work history entries you can find, even if section headers are missing
- Skills should be individual items, not categories
- Handle corrupted characters gracefully (PDF extraction artifacts)
- For URLs, include full URLs with https:// prefix
- For partial URLs like "github.com/user", prepend "https://"

Resume text:
${text}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a resume parser. Extract structured data from resume text and return valid JSON only. No markdown, no explanation, just the JSON object.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content);
    console.log("OpenAI parsed resume:", {
      full_name: parsed.full_name,
      skills_count: parsed.skills?.length || 0,
      work_history_count: parsed.work_history?.length || 0,
      location: parsed.location,
      contact: parsed.contact,
    });

    // Validate and normalize the response
    const contact = parsed.contact || {};
    return {
      full_name: parsed.full_name || null,
      bio: parsed.bio || null,
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s: unknown) => typeof s === "string") : [],
      location: parsed.location || null,
      contact: {
        email: contact.email || null,
        phone: contact.phone || null,
        website: contact.website || null,
        linkedin_url: contact.linkedin_url || null,
        github_url: contact.github_url || null,
        twitter_url: contact.twitter_url || null,
      },
      work_history: Array.isArray(parsed.work_history)
        ? parsed.work_history.map((entry: Record<string, unknown>) => ({
            company: String(entry.company || "Unknown Company"),
            position: String(entry.position || "Unknown Position"),
            description: entry.description ? String(entry.description) : null,
            start_date: String(entry.start_date || ""),
            end_date: entry.end_date ? String(entry.end_date) : null,
            is_current: Boolean(entry.is_current),
            location: entry.location ? String(entry.location) : null,
          }))
        : [],
    };
  } catch (error) {
    console.error("OpenAI parsing error:", error);
    throw error;
  }
}

// Main parsing function
export async function parseResumeFile(buffer: Buffer, mimeType: string): Promise<ParsedResumeProfile> {
  let text = "";

  if (mimeType === "application/pdf") {
    // Convert Buffer to Uint8Array for unpdf
    const uint8Array = new Uint8Array(buffer);
    const { text: pdfText } = await extractText(uint8Array);
    text = Array.isArray(pdfText) ? pdfText.join("\n") : pdfText;
  } else if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    throw new Error("Unsupported file type. Please upload a PDF or Word document.");
  }

  // Normalize whitespace
  text = text.replace(/\r\n/g, "\n").replace(/\t/g, " ");

  // Check if experience section exists (for debug info)
  const hasExperienceSection = /(?:work experience|experience|work history|employment|professional experience)/i.test(text);

  // Log the raw text for debugging
  console.log("=== RAW TEXT PREVIEW ===");
  console.log(text.slice(0, 2000));
  console.log("========================");

  // Parse with OpenAI
  const parsed = await parseWithOpenAI(text);

  // Add debug info
  return {
    ...parsed,
    _debug: {
      text_length: text.length,
      text_preview: text.slice(0, 1500),
      has_experience_section: hasExperienceSection,
    },
  };
}
