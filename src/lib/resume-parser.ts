import { extractText } from "unpdf";
import mammoth from "mammoth";

export interface ParsedWorkHistory {
  company: string;
  position: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  location: string | null;
}

export interface ParsedResumeProfile {
  full_name: string | null;
  bio: string | null;
  skills: string[];
  work_history: ParsedWorkHistory[];
  location: string | null;
}

// Parse month/year string to ISO date (first day of month)
function parseDate(dateStr: string): string | null {
  const monthNames: Record<string, string> = {
    jan: "01", january: "01",
    feb: "02", february: "02",
    mar: "03", march: "03",
    apr: "04", april: "04",
    may: "05",
    jun: "06", june: "06",
    jul: "07", july: "07",
    aug: "08", august: "08",
    sep: "09", september: "09", sept: "09",
    oct: "10", october: "10",
    nov: "11", november: "11",
    dec: "12", december: "12",
  };

  const normalized = dateStr.toLowerCase().trim();

  // Match patterns like "Jan 2020", "January 2020", "01/2020", "2020"
  const monthYearMatch = normalized.match(/([a-z]+)\s*(\d{4})/);
  if (monthYearMatch) {
    const month = monthNames[monthYearMatch[1]];
    const year = monthYearMatch[2];
    if (month && year) {
      return `${year}-${month}-01`;
    }
  }

  // Just year
  const yearMatch = normalized.match(/^(\d{4})$/);
  if (yearMatch) {
    return `${yearMatch[1]}-01-01`;
  }

  // MM/YYYY format
  const slashMatch = normalized.match(/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    const year = slashMatch[2];
    return `${year}-${month}-01`;
  }

  return null;
}

// Extract work history from text
function extractWorkHistory(text: string): ParsedWorkHistory[] {
  const workHistory: ParsedWorkHistory[] = [];

  // Common patterns in LinkedIn exports
  // Look for "Experience" section
  const experienceSection = text.match(/experience\s*([\s\S]*?)(?=education|skills|certifications|$)/i);
  if (!experienceSection) return workHistory;

  const expText = experienceSection[1];

  // Split by common job entry patterns
  // LinkedIn format: "Title\nCompany Name · Employment Type\nDates · Duration\nLocation"
  // Or: "Title at Company\nDates"

  // Try to find job entries by looking for date patterns
  const datePattern = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\s*[-–—]\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}|present|current)/gi;

  const lines = expText.split("\n").map(l => l.trim()).filter(l => l);

  let currentJob: Partial<ParsedWorkHistory> | null = null;
  let descriptionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line contains a date range
    const dateMatch = line.match(/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\s*[-–—]\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}|present|current)/i);

    if (dateMatch) {
      // Save previous job if exists
      if (currentJob && currentJob.company && currentJob.position) {
        currentJob.description = descriptionLines.join("\n").trim() || null;
        workHistory.push(currentJob as ParsedWorkHistory);
      }

      // Parse dates
      const [fullMatch] = dateMatch;
      const dateParts = fullMatch.split(/[-–—]/);
      const startDate = parseDate(dateParts[0]?.trim() || "");
      const endPart = dateParts[1]?.trim().toLowerCase() || "";
      const isCurrent = endPart.includes("present") || endPart.includes("current");
      const endDate = isCurrent ? null : parseDate(endPart);

      // Look back for position and company
      // Usually the structure is:
      // Position
      // Company · Type
      // Date range · Duration
      // Location (optional)

      let position = "";
      let company = "";
      let location: string | null = null;

      // Check previous lines for position and company
      if (i >= 2) {
        // Line before date might be company or location
        const prevLine = lines[i - 1] || "";
        const prevPrevLine = lines[i - 2] || "";

        // Company often has · or | separator with employment type
        if (prevLine.includes("·") || prevLine.includes("|")) {
          company = prevLine.split(/[·|]/)[0]?.trim() || "";
          position = prevPrevLine;
        } else if (prevPrevLine.includes("·") || prevPrevLine.includes("|")) {
          company = prevPrevLine.split(/[·|]/)[0]?.trim() || "";
          position = lines[i - 3] || "";
        } else {
          // Simple format: Position at Company or just Position\nCompany
          if (prevPrevLine.toLowerCase().includes(" at ")) {
            const parts = prevPrevLine.split(/ at /i);
            position = parts[0]?.trim() || "";
            company = parts[1]?.trim() || "";
          } else {
            position = prevPrevLine;
            company = prevLine;
          }
        }
      }

      // Check if next line might be location
      const nextLine = lines[i + 1] || "";
      if (nextLine && !nextLine.match(datePattern) && nextLine.length < 50) {
        // Could be location if it looks like a place
        if (nextLine.match(/,|city|state|country|remote/i) || nextLine.match(/[A-Z][a-z]+,\s*[A-Z]{2}/)) {
          location = nextLine;
        }
      }

      currentJob = {
        company: company.trim(),
        position: position.trim(),
        start_date: startDate || "",
        end_date: endDate,
        is_current: isCurrent,
        location,
        description: null,
      };
      descriptionLines = [];
    } else if (currentJob) {
      // This might be description or other details
      // Skip short lines that look like metadata
      if (line.length > 20 && !line.match(/^\d+\s*(years?|months?|yrs?|mos?)/i)) {
        descriptionLines.push(line);
      }
    }
  }

  // Don't forget the last job
  if (currentJob && currentJob.company && currentJob.position && currentJob.start_date) {
    currentJob.description = descriptionLines.join("\n").trim() || null;
    workHistory.push(currentJob as ParsedWorkHistory);
  }

  return workHistory;
}

// Extract skills from text
function extractSkills(text: string): string[] {
  const skills: string[] = [];

  // Look for Skills section
  const skillsSection = text.match(/skills\s*([\s\S]*?)(?=experience|education|certifications|languages|interests|$)/i);
  if (!skillsSection) return skills;

  const skillsText = skillsSection[1];

  // Skills are often listed one per line or comma-separated
  const lines = skillsText.split(/[\n,·•]/).map(l => l.trim()).filter(l => l);

  for (const line of lines) {
    // Skip lines that look like endorsement counts or metadata
    if (line.match(/^\d+$/) || line.match(/endorsement/i)) continue;
    // Skip very long lines (probably not just a skill name)
    if (line.length > 50) continue;
    // Skip common non-skill patterns
    if (line.match(/^(show|see|view|top|all)\s/i)) continue;

    if (line.length >= 2 && line.length <= 50) {
      skills.push(line);
    }

    // Limit to reasonable number
    if (skills.length >= 20) break;
  }

  return skills;
}

// Extract name from text (usually at the very beginning)
function extractName(text: string): string | null {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);

  // First few non-empty lines often contain the name
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Skip LinkedIn boilerplate
    if (line.toLowerCase().includes("linkedin") || line.toLowerCase().includes("profile")) continue;
    // Name is usually short (2-4 words)
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 5 && line.length < 50) {
      // Check it looks like a name (starts with capital letters)
      if (line.match(/^[A-Z][a-z]+\s+[A-Z]/)) {
        return line;
      }
    }
  }

  return null;
}

// Extract bio/summary from text
function extractBio(text: string): string | null {
  // Look for About or Summary section
  const aboutMatch = text.match(/(?:about|summary)\s*([\s\S]*?)(?=experience|education|skills|$)/i);
  if (!aboutMatch) return null;

  const aboutText = aboutMatch[1].trim();

  // Clean up and limit length
  const lines = aboutText.split("\n").map(l => l.trim()).filter(l => l && l.length > 10);
  const bio = lines.slice(0, 5).join("\n");

  return bio.length >= 20 ? bio.slice(0, 1000) : null;
}

// Extract location from text
function extractLocation(text: string): string | null {
  // Location is often near the top, after name
  const locationMatch = text.match(/(?:location|located in|based in)[:\s]*([^\n]+)/i);
  if (locationMatch) {
    return locationMatch[1].trim();
  }

  // Look for city, state/country pattern near the top
  const lines = text.split("\n").slice(0, 10);
  for (const line of lines) {
    const trimmed = line.trim();
    // Match patterns like "San Francisco, CA" or "New York, United States"
    if (trimmed.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}(?:\s|$)/) ||
        trimmed.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+/)) {
      if (trimmed.length < 50 && !trimmed.toLowerCase().includes("experience")) {
        return trimmed;
      }
    }
  }

  return null;
}

// Main parsing function
export async function parseResumeFile(buffer: Buffer, mimeType: string): Promise<ParsedResumeProfile> {
  let text = "";

  if (mimeType === "application/pdf") {
    const { text: pdfText } = await extractText(buffer);
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

  return {
    full_name: extractName(text),
    bio: extractBio(text),
    skills: extractSkills(text),
    work_history: extractWorkHistory(text),
    location: extractLocation(text),
  };
}
