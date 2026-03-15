import { detectPrRequirements } from "./pr-detection.js";
import type {
  EmploymentTypeResult,
  ExperienceLevelResult,
  JobAnalysisResult,
  TechStackResult,
  WorkArrangementResult,
} from "./types.js";

const TECH_KEYWORDS = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C#",
  "C++",
  "Go",
  "Rust",
  "Ruby",
  "PHP",
  "Swift",
  "Kotlin",
  "HTML",
  "CSS",
  "SQL",
  "NoSQL",
  "R",
  "Matlab",
  "Scala",
  "Perl",
  "Shell",
  "Bash",
  "PowerShell",
  "React",
  "Angular",
  "Vue",
  "Svelte",
  "Next.js",
  "Nuxt",
  "Redux",
  "Tailwind",
  "Bootstrap",
  "jQuery",
  "Webpack",
  "Vite",
  "Babel",
  "Sass",
  "Less",
  "GraphQL",
  "Node.js",
  "Express",
  "NestJS",
  "Django",
  "Flask",
  "FastAPI",
  "Spring",
  "Spring Boot",
  ".NET",
  "ASP.NET",
  "Laravel",
  "Symfony",
  "Rails",
  "Ruby on Rails",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Elasticsearch",
  "Cassandra",
  "DynamoDB",
  "Firestore",
  "SQLite",
  "MariaDB",
  "Oracle",
  "SQL Server",
  "AWS",
  "Azure",
  "GCP",
  "Google Cloud",
  "Docker",
  "Kubernetes",
  "Terraform",
  "Ansible",
  "Jenkins",
  "CircleCI",
  "GitHub Actions",
  "GitLab CI",
  "Heroku",
  "Netlify",
  "Vercel",
  "DigitalOcean",
  "Cloudflare",
  "React Native",
  "Flutter",
  "Ionic",
  "Xamarin",
  "Android",
  "iOS",
  "TensorFlow",
  "PyTorch",
  "Keras",
  "Scikit-learn",
  "Pandas",
  "NumPy",
  "Spark",
  "Hadoop",
  "BigQuery",
  "Snowflake",
  "Databricks",
  "Tableau",
  "Power BI",
  "Shopify Liquid",
];

export function detectWorkArrangement(text: string): WorkArrangementResult {
  if (/\b(remote|work from home|wfh|fully remote)\b/i.test(text)) {
    if (!/\b(no|not|non)\s+(remote|work from home|wfh)\b/i.test(text)) {
      return {
        type: "remote",
        confidence: "high",
        reasoning: "Explicitly mentions remote work.",
      };
    }
  }

  if (/\b(hybrid|flexible work|mix of home and office|days? in office)\b/i.test(text)) {
    return {
      type: "hybrid",
      confidence: "high",
      reasoning: "Explicitly mentions hybrid work.",
    };
  }

  if (/\b(on-site|in-office|work from office|must be based in|office based)\b/i.test(text)) {
    return {
      type: "on-site",
      confidence: "high",
      reasoning: "Explicitly mentions on-site/office work.",
    };
  }

  if (text.toLowerCase().includes("office") && !text.toLowerCase().includes("remote")) {
    return {
      type: "on-site",
      confidence: "medium",
      reasoning: "Mentions office without remote context.",
    };
  }

  return {
    type: "unknown",
    confidence: "low",
    reasoning: "No clear work arrangement found.",
  };
}

export function detectEmploymentType(text: string): EmploymentTypeResult {
  if (/\b(full-time|full time|permanent)\b/i.test(text)) {
    return { type: "full-time", confidence: "high", reasoning: "Explicitly mentions full-time." };
  }
  if (/\b(contract|contractor|temp|temporary|fixed term)\b/i.test(text)) {
    return { type: "contract", confidence: "high", reasoning: "Explicitly mentions contract." };
  }
  if (/\b(part-time|part time)\b/i.test(text)) {
    return { type: "part-time", confidence: "high", reasoning: "Explicitly mentions part-time." };
  }
  if (/\b(casual)\b/i.test(text)) {
    return { type: "casual", confidence: "high", reasoning: "Explicitly mentions casual." };
  }
  return { type: "unknown", confidence: "low", reasoning: "No clear employment type found." };
}

export function detectExperienceLevel(text: string): ExperienceLevelResult {
  const years = extractExperienceYears(text);

  if (/\b(senior|sr\.?|principal|staff\s+(?:engineer|developer|software))\b/i.test(text)) {
    return {
      level: "senior",
      years,
      confidence: "high",
      reasoning: "Explicitly mentions Senior/Principal/Staff role.",
    };
  }

  if (
    /\b((?:team|tech|technical|engineering|product)\s+lead|lead\s+(?:developer|engineer|designer|data)|manager|head\s+of|director|vp)\b/i.test(
      text,
    ) &&
    !/reporting\s+to\s+(?:the\s+)?(?:head\s+of|director|vp|manager)/i.test(text)
  ) {
    return {
      level: "lead",
      years,
      confidence: "high",
      reasoning: "Explicitly mentions Lead/Manager/Director role.",
    };
  }

  if (/\b(junior|jr\.?|entry\s+level|entry-level)\b/i.test(text)) {
    return {
      level: "junior",
      years,
      confidence: "high",
      reasoning: "Explicitly mentions Junior/Entry Level.",
    };
  }

  if (/\b(graduate|grad)\b/i.test(text)) {
    return {
      level: "graduate",
      years,
      confidence: "high",
      reasoning: "Explicitly mentions Graduate.",
    };
  }

  if (/\b(intern|internship)\b/i.test(text)) {
    return {
      level: "intern",
      years,
      confidence: "high",
      reasoning: "Explicitly mentions Intern.",
    };
  }

  if (/\b(mid-level|mid\s+level|intermediate)\b/i.test(text)) {
    return {
      level: "mid",
      years,
      confidence: "high",
      reasoning: "Explicitly mentions Mid-level.",
    };
  }

  if (years !== null) {
    if (years >= 5) {
      return {
        level: "senior",
        years,
        confidence: "medium",
        reasoning: `Inferred Senior from ${years}+ years experience.`,
      };
    }
    if (years >= 3) {
      return {
        level: "mid",
        years,
        confidence: "medium",
        reasoning: `Inferred Mid-level from ${years}+ years experience.`,
      };
    }
    return {
      level: "junior",
      years,
      confidence: "medium",
      reasoning: `Inferred Junior from ${years} years experience.`,
    };
  }

  return {
    level: "unknown",
    years: null,
    confidence: "low",
    reasoning: "No clear experience level found.",
  };
}

export function extractExperienceYears(text: string): number | null {
  const patterns = [
    /\b(\d+)(?:\+)?\s*(?:-\s*\d+(?:\+)?)?\s+years?(?:\s+of)?\s+experience\b/i,
    /\bexperience\s+of\s+(\d+)(?:\+)?\s*(?:-\s*\d+(?:\+)?)?\s+years?\b/i,
    /\b(\d+)(?:\+)?\s*(?:-\s*\d+(?:\+)?)?\s+years?\s+(?:in|with|building|developing|working)\b/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }

  return null;
}

export function extractTechStack(text: string): TechStackResult {
  const found = new Set<string>();

  for (const tech of TECH_KEYWORDS) {
    const pattern =
      tech === "C++"
        ? /C\+\+/i
        : tech === "C#"
          ? /C#/i
          : tech === ".NET"
            ? /\.NET/i
            : tech === "Node.js"
              ? /Node\.js/i
              : new RegExp(`\\b${escapeRegExp(tech)}\\b`, "i");

    if (pattern.test(text)) {
      found.add(tech);
    }
  }

  const technologies = [...found].sort();
  return { technologies, count: technologies.length };
}

export function analyzeJobDescription(text: string): JobAnalysisResult {
  return {
    workArrangement: detectWorkArrangement(text),
    employmentType: detectEmploymentType(text),
    experienceLevel: detectExperienceLevel(text),
    techStack: extractTechStack(text),
    prDetection: detectPrRequirements(text),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
