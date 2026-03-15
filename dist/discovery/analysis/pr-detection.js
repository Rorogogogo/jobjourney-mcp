const PR_REQUIRED_PATTERNS = [
    /\b(permanent\s+resident|pr\s+required|pr\s+only|permanent\s+residency|pr\s+status)\b/i,
    /\b(must\s+be\s+(a\s+)?permanent\s+resident|require\s+permanent\s+residency)\b/i,
    /\b(only\s+permanent\s+residents|permanent\s+residents\s+only)\b/i,
    /\b(citizen(ship)?\s+(required|only)|must\s+be\s+(a\s+)?citizen)\b/i,
    /\b(only\s+citizens|citizens\s+only)\b/i,
    /\b(must\s+have\s+(valid\s+)?work\s+authorization|authorized\s+to\s+work\s+without\s+sponsorship)\b/i,
    /\b(no\s+visa\s+sponsorship|not\s+sponsoring\s+visas?)\b/i,
    /\b(must\s+be\s+eligible\s+to\s+work\s+without\s+sponsorship)\b/i,
    /\b(legal\s+right\s+to\s+work|legally\s+authorized\s+to\s+work)\b/i,
    /\b(right\s+to\s+work\s+in\s+(australia|canada|uk|united\s+states))\b/i,
    /\b(no\s+work\s+visa\s+required|must\s+not\s+require\s+sponsorship)\b/i,
    /\b(unable\s+to\s+sponsor|cannot\s+sponsor\s+visa)\b/i,
    /\b(australian\s+citizen|canadian\s+citizen|british\s+citizen|us\s+citizen)\b/i,
    /\b(indefinite\s+leave\s+to\s+remain|settled\s+status)\b/i,
    /\b(landed\s+immigrant)\b/i,
];
const PR_NOT_REQUIRED_PATTERNS = [
    /\b(visa\s+sponsorship\s+available|will\s+sponsor\s+visa)\b/i,
    /\b(sponsoring\s+eligible\s+candidates|open\s+to\s+sponsorship)\b/i,
    /\b(h1b\s+transfer|h1b\s+sponsorship)\b/i,
    /\b(work\s+permit\s+assistance|visa\s+support)\b/i,
    /\b(all\s+visa\s+types\s+welcome|international\s+candidates\s+welcome)\b/i,
    /\b(485\s+(working\s+)?visa|graduate\s+visa|temporary\s+visa)\b/i,
    /\b(visa\s+status.*citizen.*permanent\s+resident.*visa\s+holder)\b/i,
    /\b(whether\s+you\s+are.*citizen.*permanent\s+resident.*or\s+other)\b/i,
    /\b(please\s+list.*citizen.*permanent\s+resident.*visa)\b/i,
];
const SECURITY_CLEARANCE_PATTERNS = [
    ["NV2", /\b(nv2|negative\s+vetting\s+(level\s+)?2)\b/i],
    ["NV1", /\b(nv1|negative\s+vetting\s+(level\s+)?1)\b/i],
    ["Baseline", /\b(baseline\s+clearance|baseline\s+security\s+clearance)\b/i],
    ["AGSVA", /\b(agsva|security\s+clearance|defence\s+clearance)\b/i],
    ["Defence", /\b(defence\s+experience|experience\s+in\s+defence)\b/i],
];
const CITIZENSHIP_PATTERNS = [
    /\b(must\s+be\s+(an\s+)?australian\s+citizen)\b/i,
    /\b(australian\s+citizens\s+only)\b/i,
    /\b(citizenship\s+is\s+required)\b/i,
];
const CONTEXT_KEYWORDS = [
    /\b(work\s+permit|visa|immigration|sponsorship|authorization)\b/i,
];
export function detectPrRequirements(jobText) {
    if (!jobText) {
        return {
            isPrRequired: false,
            securityClearance: null,
            confidence: "low",
            matchedPatterns: [],
            reasoning: "No job text provided",
        };
    }
    const text = jobText.toLowerCase();
    const matchedPatterns = [];
    let prRequiredScore = 0;
    let prNotRequiredScore = 0;
    let isCitizenRequired = false;
    let securityClearance = null;
    let earliestClearanceMatch = null;
    for (const [level, pattern] of SECURITY_CLEARANCE_PATTERNS) {
        const match = pattern.exec(text);
        if (!match) {
            continue;
        }
        if (!earliestClearanceMatch || match.index < earliestClearanceMatch[2]) {
            earliestClearanceMatch = [level, match[0], match.index];
        }
    }
    if (earliestClearanceMatch) {
        securityClearance = earliestClearanceMatch[0];
        isCitizenRequired = true;
        matchedPatterns.push(`SECURITY_CLEARANCE_${earliestClearanceMatch[0]}: "${earliestClearanceMatch[1]}"`);
    }
    CITIZENSHIP_PATTERNS.forEach((pattern, index) => {
        const match = pattern.exec(text);
        if (!match) {
            return;
        }
        isCitizenRequired = true;
        matchedPatterns.push(`CITIZENSHIP_REQUIRED_${index}: "${match[0]}"`);
    });
    PR_REQUIRED_PATTERNS.forEach((pattern, index) => {
        const match = pattern.exec(text);
        if (!match) {
            return;
        }
        matchedPatterns.push(`PR_REQUIRED_${index}: "${match[0]}"`);
        prRequiredScore += 2;
    });
    PR_NOT_REQUIRED_PATTERNS.forEach((pattern, index) => {
        const match = pattern.exec(text);
        if (!match) {
            return;
        }
        matchedPatterns.push(`PR_NOT_REQUIRED_${index}: "${match[0]}"`);
        prNotRequiredScore += 1;
    });
    const hasWorkAuthContext = CONTEXT_KEYWORDS.some((pattern) => pattern.test(text));
    const isPrRequired = isCitizenRequired || prRequiredScore > prNotRequiredScore;
    let confidence = "low";
    if (isCitizenRequired || prRequiredScore >= 4) {
        confidence = "high";
    }
    else if (prRequiredScore >= 2 || (prRequiredScore > 0 && hasWorkAuthContext)) {
        confidence = "medium";
    }
    let reasoning = "No clear PR requirement indicators found";
    if (isCitizenRequired) {
        reasoning = securityClearance
            ? `Citizenship required with ${securityClearance} clearance`
            : "Citizenship required";
    }
    else if (isPrRequired) {
        reasoning = `PR likely required - found ${prRequiredScore} positive indicators`;
        if (prNotRequiredScore > 0) {
            reasoning += ` and ${prNotRequiredScore} negative indicators`;
        }
    }
    else if (prNotRequiredScore > 0) {
        reasoning = `PR likely not required - found ${prNotRequiredScore} sponsorship indicators`;
    }
    return {
        isPrRequired,
        securityClearance,
        confidence,
        matchedPatterns,
        reasoning,
    };
}
