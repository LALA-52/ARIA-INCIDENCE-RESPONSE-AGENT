/**
 * Context Assembler for Incident Response Agent
 *
 * Builds a structured, labeled context package from:
 *   - Current incident text
 *   - Extracted entities and evidence
 *   - Relevant historical memories from Hindsight
 *
 * Produces:
 *   - A structured context object for audit logging
 *   - A formatted Gemini prompt with strict evidence/history separation
 */

// Gemini system instruction addendum specifically for context assembly
export const CONTEXT_ASSEMBLY_INSTRUCTIONS = `
You will receive a structured context package containing:

  [A] CURRENT INCIDENT          — The new incident reported by the analyst (treat as ground truth)
  [B] OBSERVED EVIDENCE         — Indicators and entities extracted directly from the current incident
  [C] HISTORICAL CONTEXT        — Memories retrieved from the persistent memory bank (Hindsight)

MANDATORY RULES for analysis:
  1. OBSERVED EVIDENCE (Section B) is the ONLY source of new factual claims.
  2. HISTORICAL CONTEXT (Section C) must be used ONLY as background and corroboration.
     - Never elevate historical memories to the level of current evidence.
     - Never assert that historical events happened "now" or "in this incident".
  3. AGENT INFERENCE must be explicitly labeled when reasoning bridges evidence and history.
  4. RECOMMENDED ACTIONS must be clearly marked as analyst recommendations, not executed operations.
  5. If historical context is irrelevant to the current incident, state so explicitly and discard it.
  6. Do not invent, fabricate, or assume indicators not present in Section A or B.
  7. Ask for missing information in the "missing" field rather than assuming.

Your response MUST follow this labeled structure in the JSON output:
  - summary          : What happened (current incident in one paragraph)
  - evidence         : Only what was directly observed in this incident
  - entities         : Extracted indicators (IPs, accounts, processes, etc.)
  - historicalContext: What is relevant from past memory and WHY — or "No relevant historical context retrieved."
  - assessment       : Reasoned interpretation combining evidence + history (clearly label inferences)
  - recommendedInvestigation : Ordered steps for the analyst
  - recommendedResponse      : Containment / eradication / recovery recommendations (not executed)
  - confidence       : high | medium | low with explanation
  - confidenceLevel  : "high" | "medium" | "low"
  - missing          : What additional data would materially improve the assessment
  - shouldRetain     : true if this interaction contains long-term useful security intelligence
  - memoryToRetain   : Factual security context for persistent memory (no credentials, no API keys)
`;

/**
 * Build the structured context object for audit logging and Gemini prompt construction.
 *
 * @param {object} params
 * @param {string}   params.incidentText          - Raw analyst incident input
 * @param {object}   params.extraction            - Output from extractKeyEntities()
 * @param {Array}    params.relevantMemories       - Filtered Hindsight memory results
 * @param {string}   params.bankId                - Hindsight bank identifier
 * @param {string}   params.recallQuery            - The query used for Hindsight Recall
 * @param {number}   params.rawRecallCount         - Total memories returned before filtering
 * @returns {object} Structured context object
 */
export function assembleContext({
    incidentText,
    extraction,
    relevantMemories,
    bankId,
    recallQuery,
    rawRecallCount
}) {
    const hasHistory = relevantMemories.length > 0;

    // Section A: Current Incident (unchanged, verbatim)
    const currentIncident = incidentText.trim();

    // Section B: Observed Evidence (directly from extraction, not from memory)
    const observedEvidence = {
        raw: currentIncident,
        extractedEntities: extraction.entities,
        categorized: {
            ipAddresses:   extraction.categorized.ips,
            domains:       extraction.categorized.domains,
            urls:          extraction.categorized.urls,
            fileHashes:    extraction.categorized.hashes,
            userAccounts:  extraction.categorized.usernames,
            hostnames:     extraction.categorized.hostnames,
            processes:     extraction.categorized.processes,
            malware:       extraction.categorized.malware,
            timestamps:    extraction.categorized.timestamps
        },
        contextualReferenceResolved: extraction.contextualReference || false
    };

    // Section C: Historical Context (from Hindsight, labeled separately)
    const historicalContext = {
        source:       'Hindsight Persistent Memory',
        bankId:       bankId,
        recallQuery:  recallQuery,
        totalRetrieved: rawRecallCount,
        totalSelected:  relevantMemories.length,
        memories: relevantMemories.map((m, idx) => ({
            label:    `Historical Memory ${idx + 1}`,
            id:       m.id,
            text:     m.text,
            context:  m.context || null,
            entities: m.entities || [],
            relevanceScore: m.scores?.final ?? m.scores?.semantic ?? 0
        }))
    };

    // Metadata
    const metadata = {
        assembledAt:   new Date().toISOString(),
        incidentLength: currentIncident.length
    };

    return {
        metadata,
        currentIncident,
        observedEvidence,
        historicalContext,
        hasHistory
    };
}

/**
 * Build the formatted Gemini prompt from the assembled context object.
 *
 * @param {object} ctx - Output from assembleContext()
 * @returns {string} Full formatted prompt for Gemini
 */
export function buildGeminiPrompt(ctx) {
    const { currentIncident, observedEvidence, historicalContext, hasHistory } = ctx;

    // Format Section B
    const evidenceLines = [];
    if (observedEvidence.categorized.ipAddresses.length > 0) {
        evidenceLines.push(`IP Addresses:   ${observedEvidence.categorized.ipAddresses.join(', ')}`);
    }
    if (observedEvidence.categorized.userAccounts.length > 0) {
        evidenceLines.push(`User Accounts:  ${observedEvidence.categorized.userAccounts.join(', ')}`);
    }
    if (observedEvidence.categorized.domains.length > 0) {
        evidenceLines.push(`Domains:        ${observedEvidence.categorized.domains.join(', ')}`);
    }
    if (observedEvidence.categorized.fileHashes.length > 0) {
        evidenceLines.push(`File Hashes:    ${observedEvidence.categorized.fileHashes.join(', ')}`);
    }
    if (observedEvidence.categorized.processes.length > 0) {
        evidenceLines.push(`Processes:      ${observedEvidence.categorized.processes.join(', ')}`);
    }
    if (observedEvidence.categorized.hostnames.length > 0) {
        evidenceLines.push(`Hostnames:      ${observedEvidence.categorized.hostnames.join(', ')}`);
    }
    if (observedEvidence.categorized.malware.length > 0) {
        evidenceLines.push(`Malware:        ${observedEvidence.categorized.malware.join(', ')}`);
    }
    if (observedEvidence.categorized.timestamps.length > 0) {
        evidenceLines.push(`Timestamps:     ${observedEvidence.categorized.timestamps.join(', ')}`);
    }
    if (observedEvidence.contextualReferenceResolved) {
        evidenceLines.push(`(Note: A contextual reference such as "the same IP" was resolved using session state.)`);
    }

    const evidenceBlock = evidenceLines.length > 0
        ? evidenceLines.join('\n')
        : '(No structured indicators extracted from current incident text)';

    // Format Section C
    let historicalBlock;
    if (hasHistory) {
        const memoryLines = historicalContext.memories.map(m =>
            `  [${m.label}]\n  Text:     ${m.text}\n  Entities: ${m.entities.join(', ') || 'none'}\n  Score:    ${m.relevanceScore.toFixed(4)}`
        );
        historicalBlock = [
            `Source:       ${historicalContext.source} ("${historicalContext.bankId}")`,
            `Recall Query: "${historicalContext.recallQuery}"`,
            `Retrieved:    ${historicalContext.totalRetrieved} memories total | ${historicalContext.totalSelected} selected as relevant`,
            '',
            ...memoryLines
        ].join('\n');
    } else {
        historicalBlock = `(No relevant historical context retrieved from bank "${historicalContext.bankId}" for this incident)`;
    }

    return `${CONTEXT_ASSEMBLY_INSTRUCTIONS}

================================================================================
[A] CURRENT INCIDENT
================================================================================
${currentIncident}

================================================================================
[B] OBSERVED EVIDENCE (Extracted directly from current incident — current facts only)
================================================================================
${evidenceBlock}

================================================================================
[C] HISTORICAL CONTEXT (Recalled from Hindsight persistent memory — NOT current evidence)
================================================================================
${historicalBlock}

================================================================================
TASK
================================================================================
Analyze the current incident using the structure above.
Apply the mandatory rules in the system instruction exactly.
Return strictly valid JSON matching the schema defined in your system instructions.
`;
}

/**
 * Print structured context assembly log to console for test visibility.
 *
 * @param {object} ctx    - Assembled context object
 * @param {string} prompt - Formatted Gemini prompt
 */
export function logContextAssembly(ctx, prompt) {
    const SEPARATOR = '='.repeat(72);
    const SUB = '-'.repeat(72);

    console.log(`\n${SEPARATOR}`);
    console.log(`CONTEXT ASSEMBLY LOG  [${ctx.metadata.assembledAt}]`);
    console.log(SEPARATOR);

    console.log(`\n[A] CURRENT INCIDENT`);
    console.log(SUB);
    console.log(ctx.currentIncident);

    console.log(`\n[B] OBSERVED EVIDENCE`);
    console.log(SUB);
    const ev = ctx.observedEvidence.categorized;
    if (ev.ipAddresses.length)   console.log(`  IPs:          ${ev.ipAddresses.join(', ')}`);
    if (ev.userAccounts.length)  console.log(`  Accounts:     ${ev.userAccounts.join(', ')}`);
    if (ev.processes.length)     console.log(`  Processes:    ${ev.processes.join(', ')}`);
    if (ev.domains.length)       console.log(`  Domains:      ${ev.domains.join(', ')}`);
    if (ev.fileHashes.length)    console.log(`  Hashes:       ${ev.fileHashes.join(', ')}`);
    if (ev.malware.length)       console.log(`  Malware:      ${ev.malware.join(', ')}`);
    if (ctx.observedEvidence.contextualReferenceResolved) {
        console.log(`  (Contextual reference resolved from session state)`);
    }
    if (ctx.observedEvidence.extractedEntities.length === 0) {
        console.log(`  (No structured indicators extracted)`);
    }

    console.log(`\n[C] HISTORICAL CONTEXT`);
    console.log(SUB);
    const hc = ctx.historicalContext;
    console.log(`  Bank:         ${hc.bankId}`);
    console.log(`  Recall Query: "${hc.recallQuery}"`);
    console.log(`  Retrieved:    ${hc.totalRetrieved} raw  |  ${hc.totalSelected} selected`);
    if (hc.memories.length > 0) {
        hc.memories.forEach(m => {
            console.log(`\n  ${m.label} (Score: ${m.relevanceScore.toFixed(4)})`);
            console.log(`    ${m.text}`);
        });
    } else {
        console.log(`  (No relevant memories selected)`);
    }

    console.log(`\n[FINAL PROMPT SENT TO GEMINI — ${prompt.length} chars]`);
    console.log(SEPARATOR);
}
