/**
 * memory-evaluator.js
 * ---------------------------------------------------------------------------
 * Automatic Memory Evaluation layer for AIRA — AI Incident Response Agent.
 *
 * Sits between Gemini's analysis output and Hindsight Retain.
 * Independently decides whether a memory is worth storing,
 * builds a structured memory record, and sanitizes the content
 * before handing it to the existing Hindsight Retain call.
 *
 * Does NOT modify: Recall, Context Assembly, or the Hindsight client call.
 * ---------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

/** Minimum entity count to consider storing without override */
const MIN_ENTITY_THRESHOLD = 1;

/** Confidence levels that always warrant storage if significant */
const RETAIN_CONFIDENCE_LEVELS = ['high', 'medium'];

/**
 * Sensitive keyword patterns — memory containing these is scrubbed.
 * Attack-technique terms that look similar (e.g. "password spraying") are exempted.
 */
const SENSITIVE_PATTERNS = [
    { pattern: /\bpassword\s*[:=]\s*\S+/i,   label: 'password assignment' },
    { pattern: /\bapi[_-]?key\s*[:=]\s*\S+/i, label: 'api key assignment' },
    { pattern: /\bsecret\s*[:=]\s*\S+/i,      label: 'secret assignment' },
    { pattern: /\bbearer\s+[A-Za-z0-9\-._~+/]+=*/i, label: 'bearer token' },
    { pattern: /\btoken\s*[:=]\s*\S+/i,        label: 'token assignment' },
    { pattern: /\bprivate[_-]?key\b/i,         label: 'private key' },
    { pattern: /hsk_[a-f0-9]+/i,               label: 'hindsight api key' },
    { pattern: /AIza[0-9A-Za-z\-_]{35}/,       label: 'google api key' },
];

/**
 * Keywords in the incident/analysis that signal long-term value.
 * Higher weight → more likely to retain.
 */
const VALUE_SIGNALS = [
    { keyword: 'brute-force',       weight: 3 },
    { keyword: 'brute force',       weight: 3 },
    { keyword: 'authentication',    weight: 2 },
    { keyword: 'successful auth',   weight: 4 },
    { keyword: 'compromised',       weight: 5 },
    { keyword: 'lateral movement',  weight: 5 },
    { keyword: 'exfiltration',      weight: 5 },
    { keyword: 'malware',           weight: 4 },
    { keyword: 'ransomware',        weight: 5 },
    { keyword: 'c2',                weight: 4 },
    { keyword: 'command and control', weight: 4 },
    { keyword: 'persistence',       weight: 4 },
    { keyword: 'privilege escalation', weight: 4 },
    { keyword: 'confirmed',         weight: 3 },
    { keyword: 'recurring',         weight: 3 },
    { keyword: 'pattern',           weight: 2 },
    { keyword: 'associated',        weight: 2 },
    { keyword: 'indicator',         weight: 2 },
    { keyword: 'ip address',        weight: 2 },
    { keyword: 'hash',              weight: 2 },
    { keyword: 'domain',            weight: 2 },
];

/** Value score threshold above which we always store */
const RETAIN_SCORE_THRESHOLD = 4;

// ---------------------------------------------------------------------------
// EVALUATION RESULT TYPES
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} MemoryEvaluationResult
 * @property {boolean}  shouldRetain        - Final decision: retain or not
 * @property {string}   decision            - 'RETAIN' | 'SKIP'
 * @property {string[]} reasons             - Human-readable list of evaluation reasons
 * @property {number}   valueScore          - Computed value score
 * @property {string|null} structuredRecord - Final formatted memory string (null if skipping)
 * @property {object}   metadata            - Metadata to attach to Hindsight Retain call
 * @property {string}   logSummary          - Console log line
 */

// ---------------------------------------------------------------------------
// CORE EVALUATION FUNCTION
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a Gemini analysis + incident warrant long-term memory storage.
 * Builds a structured memory record if so.
 *
 * @param {object} params
 * @param {string}   params.incidentText   - Original analyst incident input
 * @param {object}   params.parsedJson     - Gemini's parsed JSON analysis output
 * @param {object}   params.contextObj     - Assembled context (from context-assembler.js)
 * @param {object}   params.extraction     - Entity extraction result (from entity-extractor.js)
 * @returns {MemoryEvaluationResult}
 */
export function evaluateMemory({ incidentText, parsedJson, contextObj, extraction }) {
    const reasons = [];
    let valueScore = 0;

    // --- 1. Gemini's own recommendation ---
    const geminiWantsRetain = parsedJson.shouldRetain === true;
    const geminiContent     = truncate(parsedJson.memoryToRetain, 500);

    if (geminiWantsRetain) {
        reasons.push('Gemini flagged shouldRetain=true');
        valueScore += 2;
    }

    // --- 2. Entity count signal ---
    const entityCount = (parsedJson.entities || extraction.entities || []).length;
    if (entityCount >= MIN_ENTITY_THRESHOLD) {
        reasons.push(`Incident contains ${entityCount} extractable entity/entities`);
        valueScore += entityCount;
    }

    // --- 3. Confidence level signal ---
    const confLevel = truncate(parsedJson.confidenceLevel || parsedJson.confidence, 50).toLowerCase();
    if (RETAIN_CONFIDENCE_LEVELS.some(l => confLevel.includes(l))) {
        reasons.push(`Gemini confidence is "${confLevel}"`);
        valueScore += confLevel.includes('high') ? 3 : 1;
    }

    // --- 4. Value keyword signals ---
    const corpus = [
        incidentText,
        truncate(parsedJson.summary, 500),
        truncate(parsedJson.assessment, 500),
        truncate(parsedJson.evidence, 500),
        geminiContent
    ].join(' ').toLowerCase();

    for (const { keyword, weight } of VALUE_SIGNALS) {
        if (corpus.includes(keyword)) {
            reasons.push(`Detected value signal: "${keyword}" (+${weight})`);
            valueScore += weight;
        }
    }

    // --- 5. Assessment contains inference / finding ---
    const assessmentStr = truncate(parsedJson.assessment, 1000);
    if (assessmentStr.length > 80) {
        reasons.push('Assessment contains substantive finding');
        valueScore += 2;
    }

    // --- 6. Historical context was used (means this incident builds on known patterns) ---
    if (contextObj.hasHistory) {
        reasons.push('Incident correlated with existing historical memories');
        valueScore += 2;
    }

    // --- DECISION ---
    const meetsThreshold = valueScore >= RETAIN_SCORE_THRESHOLD;
    const hasUsefulContent = geminiContent.length > 20
        || assessmentStr.length > 40;

    const shouldRetain = (geminiWantsRetain || meetsThreshold) && hasUsefulContent;

    if (!shouldRetain) {
        return {
            shouldRetain: false,
            decision: 'SKIP',
            reasons,
            valueScore,
            structuredRecord: null,
            metadata: {},
            logSummary: `Memory Evaluation → SKIP (score=${valueScore}, hasContent=${hasUsefulContent})`
        };
    }

    // --- BUILD STRUCTURED MEMORY RECORD ---
    const record = buildStructuredRecord({
        incidentText,
        parsedJson,
        contextObj,
        extraction,
        geminiContent
    });

    // --- SANITIZE ---
    const sanitized = sanitizeRecord(record);
    if (!sanitized) {
        return {
            shouldRetain: false,
            decision: 'SKIP_SENSITIVE',
            reasons: [...reasons, 'Record scrubbed due to sensitive content'],
            valueScore,
            structuredRecord: null,
            metadata: {},
            logSummary: `Memory Evaluation → SKIP_SENSITIVE (sensitive content detected)`
        };
    }

    // --- METADATA ---
    const entities = Array.isArray(parsedJson.entities)
        ? parsedJson.entities.join(', ')
        : extraction.entities.join(', ');

    const metadata = {
        entities:    entities || 'none',
        confidence:  confLevel || 'medium',
        timestamp:   new Date().toISOString(),
        valueScore:  String(valueScore),
        hasHistory:  String(contextObj.hasHistory)
    };

    return {
        shouldRetain: true,
        decision: 'RETAIN',
        reasons,
        valueScore,
        structuredRecord: sanitized,
        metadata,
        logSummary: `Memory Evaluation → RETAIN (score=${valueScore}, chars=${sanitized.length})`
    };
}

// ---------------------------------------------------------------------------
// STRUCTURED RECORD BUILDER
// ---------------------------------------------------------------------------

/**
 * Build the structured memory record in the required format:
 *
 *   Incident Pattern:
 *   Key Indicators:
 *   Observed Findings:
 *   Response Taken/Recommended:
 *   Outcome:
 *   Useful Future Context:
 *
 * @param {object} params
 * @returns {string}
 */
function buildStructuredRecord({ incidentText, parsedJson, contextObj, extraction, geminiContent }) {
    const entities = Array.isArray(parsedJson.entities) && parsedJson.entities.length
        ? parsedJson.entities
        : extraction.entities;

    // Incident Pattern: summarise what kind of attack/event this is
    const incidentPattern = parsedJson.summary
        ? truncate(parsedJson.summary, 300)
        : truncate(incidentText, 300);

    // Key Indicators: structured entity list
    const ev = contextObj.observedEvidence.categorized;
    const indicatorParts = [];
    if (ev.ipAddresses.length)  indicatorParts.push(`IPs: ${ev.ipAddresses.join(', ')}`);
    if (ev.userAccounts.length) indicatorParts.push(`Accounts: ${ev.userAccounts.join(', ')}`);
    if (ev.domains.length)      indicatorParts.push(`Domains: ${ev.domains.join(', ')}`);
    if (ev.fileHashes.length)   indicatorParts.push(`Hashes: ${ev.fileHashes.join(', ')}`);
    if (ev.processes.length)    indicatorParts.push(`Processes: ${ev.processes.join(', ')}`);
    if (ev.malware.length)      indicatorParts.push(`Malware: ${ev.malware.join(', ')}`);
    if (ev.hostnames.length)    indicatorParts.push(`Hosts: ${ev.hostnames.join(', ')}`);
    const keyIndicators = indicatorParts.length
        ? indicatorParts.join(' | ')
        : entities.join(', ') || 'None explicitly extracted';

    // Observed Findings: what Gemini determined from evidence + history
    const observedFindings = parsedJson.assessment
        ? truncate(parsedJson.assessment, 400)
        : truncate(parsedJson.evidence || incidentText, 400);

    // Response Taken/Recommended: ALWAYS labeled as recommended, never as executed
    const responseSection = parsedJson.recommendedResponse
        ? `RECOMMENDED (not executed): ${truncate(parsedJson.recommendedResponse, 300)}`
        : 'No specific response recommendations generated.';

    // Outcome: confidence + any missing information
    const confidence = parsedJson.confidence || parsedJson.confidenceLevel || 'unknown';
    const missing    = parsedJson.missing
        ? truncate(parsedJson.missing, 200)
        : 'None reported';
    const outcome = `Confidence: ${confidence}. Missing: ${missing}`;

    // Useful Future Context: gemini's explicit memory + historical correlation note
    const futureContextParts = [];
    if (geminiContent && geminiContent.length > 20) {
        futureContextParts.push(truncate(geminiContent, 400));
    }
    if (contextObj.hasHistory) {
        futureContextParts.push(
            `Previously correlated with ${contextObj.historicalContext.totalSelected} historical ` +
            `memory/memories from bank "${contextObj.historicalContext.bankId}".`
        );
    }
    const usefulFutureContext = futureContextParts.length
        ? futureContextParts.join(' ')
        : 'No additional future context noted.';

    // Assemble record
    return [
        `Incident Pattern:\n${incidentPattern}`,
        ``,
        `Key Indicators:\n${keyIndicators}`,
        ``,
        `Observed Findings:\n${observedFindings}`,
        ``,
        `Response Taken/Recommended:\n${responseSection}`,
        ``,
        `Outcome:\n${outcome}`,
        ``,
        `Useful Future Context:\n${usefulFutureContext}`
    ].join('\n');
}

// ---------------------------------------------------------------------------
// SANITIZER
// ---------------------------------------------------------------------------

/**
 * Scrub sensitive patterns from the record string.
 * Returns null if the record is too dangerous to store.
 *
 * @param {string} text
 * @returns {string|null}
 */
function sanitizeRecord(text) {
    if (!text || typeof text !== 'string') return null;

    let scrubbed = text;
    for (const { pattern, label } of SENSITIVE_PATTERNS) {
        if (pattern.test(scrubbed)) {
            console.warn(`[MemoryEvaluator] Sensitive content detected (${label}). Removing from record.`);
            scrubbed = scrubbed.replace(pattern, `[REDACTED:${label.toUpperCase().replace(/\s/g, '_')}]`);
        }
    }

    // Final length sanity check
    if (scrubbed.trim().length < 30) {
        return null;
    }

    return scrubbed.trim();
}

// ---------------------------------------------------------------------------
// LOGGING
// ---------------------------------------------------------------------------

const SEP = '='.repeat(72);
const SUB = '-'.repeat(72);

/**
 * Print structured memory evaluation log to console.
 *
 * @param {MemoryEvaluationResult} result
 * @param {string} bankId
 * @param {string|null} retainStatus  - 'success' | 'error:<msg>' | null (if SKIP)
 */
export function logMemoryEvaluation(result, bankId, retainStatus = null) {
    console.log(`\n${'─'.repeat(72)}`);
    console.log(`[6. MEMORY EVALUATION]`);
    console.log(`─`.repeat(72));
    console.log(`  → Memory Selected:  ${result.decision}`);
    console.log(`  → Value Score:      ${result.valueScore}`);
    console.log(`  → Evaluation Reasons:`);
    result.reasons.forEach(r => console.log(`      • ${r}`));

    if (result.shouldRetain && result.structuredRecord) {
        console.log(`\n  → Memory Record (Structured):`);
        console.log(`  ${'·'.repeat(68)}`);
        result.structuredRecord.split('\n').forEach(line =>
            console.log(`    ${line}`)
        );
        console.log(`  ${'·'.repeat(68)}`);
        console.log(`  → Hindsight Bank:   ${bankId}`);
        console.log(`  → Retain Status:    ${retainStatus || 'pending'}`);
    } else {
        console.log(`  → Retain Status:    SKIPPED — ${result.decision}`);
    }

    console.log(`${'─'.repeat(72)}`);
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function truncate(val, maxLen = 300) {
    if (val === null || val === undefined) return '';
    let str = '';
    if (typeof val === 'string') {
        str = val;
    } else if (Array.isArray(val)) {
        str = val.map(item => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join('; ');
    } else if (typeof val === 'object') {
        str = JSON.stringify(val);
    } else {
        str = String(val);
    }
    const s = str.trim().replace(/\s+/g, ' ');
    return s.length > maxLen ? s.substring(0, maxLen - 3) + '...' : s;
}
