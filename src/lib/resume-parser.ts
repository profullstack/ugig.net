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

  // Match patterns like "Jan 2020", "January 2020"
  const monthYearMatch = normalized.match(/([a-z]+)\s*['']?\s*(\d{4})/);
  if (monthYearMatch) {
    const month = monthNames[monthYearMatch[1]];
    const year = monthYearMatch[2];
    if (month && year) {
      return `${year}-${month}-01`;
    }
  }

  // Just year (but not if it's clearly not a year)
  const yearMatch = normalized.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    if (year >= 1980 && year <= 2030) {
      return `${yearMatch[1]}-01-01`;
    }
  }

  // MM/YYYY or MM-YYYY format
  const slashMatch = normalized.match(/(\d{1,2})[\/\-](\d{4})/);
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

  // Common patterns in LinkedIn exports and standard resumes
  // Look for "Experience" or similar sections
  const experienceSection = text.match(/(?:work experience|experience|work history|employment|professional experience)\s*([\s\S]*?)(?=education|skills|certifications|technical skills|projects|references|selected projects|additional|$)/i);
  if (!experienceSection) {
    console.log("No experience section found in text");
    return workHistory;
  }

  const expText = experienceSection[1];
  console.log("Experience section found, length:", expText.length);

  // Multiple date range patterns to handle different formats:
  // "Jan 2020 - Present", "January 2020 – Dec 2023", "2020 - 2023", "(Mar 2021 – Jan 2022)"
  const dateRangePatterns = [
    // Month Year - Month Year/Present with optional parentheses (most common)
    /\(?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*['']?\s*\d{4}\s*[-–—]+\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*['']?\s*\d{4}|present|current|now|ongoing|part[- ]?time)\s*\)?/gi,
    // Year - Year/Present
    /\b(19|20)\d{2}\s*[-–—to]+\s*(?:(19|20)\d{2}|present|current|now|ongoing)\b/gi,
    // MM/YYYY - MM/YYYY
    /\d{1,2}\/\d{4}\s*[-–—to]+\s*(?:\d{1,2}\/\d{4}|present|current|now)/gi,
  ];

  // Try each pattern
  let dateMatches: { match: string; index: number }[] = [];
  for (const pattern of dateRangePatterns) {
    let match;
    while ((match = pattern.exec(expText)) !== null) {
      dateMatches.push({ match: match[0], index: match.index });
    }
  }

  console.log("Date matches found:", dateMatches.length, dateMatches.map(d => d.match));

  // Sort by position in text
  dateMatches = dateMatches.sort((a, b) => a.index - b.index);

  // Remove duplicates (overlapping matches)
  dateMatches = dateMatches.filter((m, i, arr) => {
    if (i === 0) return true;
    const prev = arr[i - 1];
    return m.index >= prev.index + prev.match.length;
  });

  if (dateMatches.length === 0) {
    console.log("No date matches after filtering");
    return workHistory;
  }

  // Process each date match
  for (let i = 0; i < dateMatches.length; i++) {
    const dateMatch = dateMatches[i];
    const nextMatch = dateMatches[i + 1];

    // Parse the date range - remove parentheses first
    const fullMatch = dateMatch.match.replace(/[()]/g, "").trim();
    const dateParts = fullMatch.split(/[-–—]/).map(s => s.trim()).filter(s => s);

    const startDate = parseDate(dateParts[0] || "");
    const endPart = (dateParts[1] || "").toLowerCase();
    const isCurrent = /present|current|now|ongoing|part[- ]?time/.test(endPart);
    const endDate = isCurrent ? null : parseDate(dateParts[1] || "");

    if (!startDate) {
      console.log("Could not parse start date from:", dateParts[0]);
      continue;
    }

    // Extract text before this date (contains title and company)
    const textBefore = i === 0
      ? expText.slice(0, dateMatch.index).trim()
      : expText.slice(dateMatches[i - 1].index + dateMatches[i - 1].match.length, dateMatch.index).trim();

    // Extract text after date until next entry (contains description)
    const textAfter = nextMatch
      ? expText.slice(dateMatch.index + dateMatch.match.length, nextMatch.index).trim()
      : expText.slice(dateMatch.index + dateMatch.match.length).trim();

    // Parse title and company from textBefore
    const lines = textBefore.split(/\n/).map(l => l.trim()).filter(l => l && l.length > 1);

    let position = "";
    let company = "";
    let location: string | null = null;

    // Look for "Company | Location" pattern (common in modern resumes)
    const companyLocationLine = lines.find(l => l.includes("|"));
    if (companyLocationLine) {
      const parts = companyLocationLine.split("|").map(p => p.trim());
      company = parts[0] || "";
      location = parts[1] || null;

      // Position is usually on the line after company or before the date
      // Look for line containing position keywords or the line just before the date
      const companyLineIndex = lines.indexOf(companyLocationLine);
      for (let j = companyLineIndex + 1; j < lines.length; j++) {
        const line = lines[j];
        // Skip if it looks like a bullet point description
        if (line.startsWith("•") || line.startsWith("-")) continue;
        // This is likely the position line
        // Remove the date part if it's embedded: "Founder, Independent Contractor (Mar 2018 – part-time)"
        position = line.replace(/\s*\([^)]*\d{4}[^)]*\)\s*$/, "").trim();
        break;
      }
    } else if (lines.length >= 2) {
      // Usually: Position on one line, Company on another
      // Check for "at" pattern: "Software Engineer at Google"
      const lastLine = lines[lines.length - 1];
      const secondLastLine = lines.length >= 2 ? lines[lines.length - 2] : "";

      if (lastLine.toLowerCase().includes(" at ")) {
        const parts = lastLine.split(/ at /i);
        position = parts[0]?.trim() || "";
        company = parts[1]?.trim() || "";
      } else if (lastLine.includes("·")) {
        // Company · Employment Type
        company = lastLine.split(/[·]/)[0]?.trim() || "";
        position = secondLastLine;
      } else {
        // Check if last line contains a date (means it's position + date)
        if (lastLine.match(/\d{4}/)) {
          position = lastLine.replace(/\s*\([^)]*\d{4}[^)]*\)\s*$/, "").trim();
          company = secondLastLine;
        } else {
          // Assume second-to-last is position, last is company
          position = secondLastLine;
          company = lastLine;
        }
      }

      // Check for location pattern in lines
      for (const line of lines) {
        if (line.match(/[A-Z][a-z]+,\s*[A-Z]{2}/) || line.match(/\bremote\b/i)) {
          // Don't overwrite if we already have location from pipe separator
          if (!location) {
            location = line.includes("|") ? line.split("|")[1]?.trim() || null : line;
          }
          break;
        }
      }
    } else if (lines.length === 1) {
      // Single line might be "Position at Company" or just company/position
      const line = lines[0];
      if (line.toLowerCase().includes(" at ")) {
        const parts = line.split(/ at /i);
        position = parts[0]?.trim() || "";
        company = parts[1]?.trim() || "";
      } else {
        // Remove date from position if embedded
        position = line.replace(/\s*\([^)]*\d{4}[^)]*\)\s*$/, "").trim();
      }
    }

    // Clean up company name (remove employment type, location suffix)
    company = company.replace(/\s*[·|]\s*(full[- ]?time|part[- ]?time|contract|freelance|intern(ship)?|remote).*$/i, "").trim();
    // Remove ", Inc." style suffixes from location if it got mixed in
    if (location && location.match(/,\s*Inc\.?$/i)) {
      location = null;
    }

    // Get description from text after date - look for bullet points
    const descriptionLines = textAfter
      .split(/\n/)
      .map(l => l.trim())
      .filter(l => {
        // Include bullet point lines
        if (l.startsWith("•") || l.startsWith("-")) return true;
        // Include longer description lines
        return l.length > 30 && !l.match(/^\d+\s*(years?|months?|yrs?|mos?)/i);
      })
      .slice(0, 5);

    const descriptionText = descriptionLines.join("\n").replace(/^[•-]\s*/gm, "• ");

    console.log("Parsed entry:", { company, position, startDate, endDate, isCurrent, location });

    if (position || company) {
      workHistory.push({
        position: position || "Unknown Position",
        company: company || "Unknown Company",
        start_date: startDate,
        end_date: endDate,
        is_current: isCurrent,
        location,
        description: descriptionText || null,
      });
    }
  }

  return workHistory;
}

// Extract skills from text
function extractSkills(text: string): string[] {
  const skills: string[] = [];

  // Look for Skills section - try different patterns since skills can appear anywhere
  const skillsSection = text.match(/(?:skills|technical skills|core competencies|expertise)\s*:?\s*([\s\S]*?)(?=\n\s*\n|experience|education|certifications|languages|interests|work history|employment|projects|$)/i);
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

  return {
    full_name: extractName(text),
    bio: extractBio(text),
    skills: extractSkills(text),
    work_history: extractWorkHistory(text),
    location: extractLocation(text),
  };
}
