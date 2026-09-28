import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HindsightClient } from '@vectorize-io/hindsight-client';
import { extractKeyEntities, filterRelevantMemories } from './entity-extractor.js';
import { assembleContext, buildGeminiPrompt, logContextAssembly } from './context-assembler.js';
import { evaluateMemory, logMemoryEvaluation } from './memory-evaluator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Environment Variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY;
const HINDSIGHT_BASE_URL = process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io';
const HINDSIGHT_BANK_ID = process.env.HINDSIGHT_BANK_ID || 'incident-response-agent';

if (!GEMINI_API_KEY) {
    console.error('WARNING: GEMINI_API_KEY is not defined in .env');
}
if (!HINDSIGHT_API_KEY) {
    console.error('WARNING: HINDSIGHT_API_KEY is not defined in .env');
}

// Initialize Clients
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const hindsight = new HindsightClient({
    baseUrl: HINDSIGHT_BASE_URL,
    apiKey: HINDSIGHT_API_KEY
});

// Candidate models in preference order
const CANDIDATE_MODELS = [
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest'
];

// Session Context state to resolve references like "the same IP address"
let sessionState = {
    lastIp: '203.0.113.25',
    lastAccount: 'admin',
    lastThreatType: 'brute-force'
};

// Ensure Hindsight bank exists on startup
async function initHindsightBank() {
    try {
        await hindsight.createBank(HINDSIGHT_BANK_ID, {
            name: "Incident Response Agent",
            background: "Persistent cybersecurity memory bank for analyzing and correlating security incidents, threat indicators, attack patterns, and historical investigation context."
        });
        console.log(`[Hindsight] Memory bank "${HINDSIGHT_BANK_ID}" ready.`);
    } catch (err) {
        console.log(`[Hindsight] Bank init check: ${err.message || err}`);
    }
}
initHindsightBank();

export const SYSTEM_PROMPT = `You are a specialized Incident Response AI Agent designed to assist security analysts with investigating and responding to cybersecurity incidents.

Your core responsibilities:
1. Analyze incident descriptions, alerts, logs, indicators, and analyst-provided information.
2. Identify the incident type and potential severity.
3. Extract relevant entities such as: IP addresses, domains, URLs, file hashes, user accounts, hostnames, processes, malware names, timestamps, MITRE ATT&CK techniques when confidently identifiable.
4. Integrate recalled historical context when relevant to correlate ongoing threats with past incidents.
5. STRICT DISTINCTION OF EVIDENCE AND HISTORY:
   - Observed Evidence: ONLY facts and indicators directly observed in the current incident. Never claim historical facts are new evidence.
   - Historical Context: Clearly labeled historical context retrieved from persistent memory. Explain why it is relevant to the current incident.
   - Assessment / Inference: Reasoned interpretation combining current evidence and recalled history.
   - Recommended Actions: Specific investigation and containment next steps.
6. Ask for missing information when it is necessary for reliable analysis.
7. Avoid fabricating logs, indicators, attack techniques, historical incidents, or remediation results.
8. Prioritize analyst safety and accuracy over speed.
9. Never execute destructive security actions; only provide recommendations.

IMPORTANT: You must return your analysis as a valid JSON object matching this structure EXACTLY:
{
  "summary": "Brief description of the current situation.",
  "evidence": "Facts and entities directly observed from the current input.",
  "entities": ["list", "of", "extracted", "entities", "such", "as", "IPs", "accounts", "etc"],
  "historicalContext": "Clearly labeled explanation of how recalled historical memories correlate with the current incident. (If no memories apply, explicitly state 'No relevant historical context retrieved.')",
  "assessment": "Reasoned interpretation and threat assessment combining evidence and historical context.",
  "recommendedInvestigation": "Specific investigation next steps for the analyst.",
  "recommendedResponse": "Potential containment, eradication, recovery, or monitoring actions.",
  "confidence": "high | medium | low (followed by a short explanation)",
  "confidenceLevel": "high | medium | low",
  "missing": "Information required to improve the assessment.",
  "shouldRetain": true | false,
  "memoryToRetain": "If shouldRetain is true: provide factual cybersecurity intelligence useful for future incident analysis. Include: attack type, observed indicators, confirmed relationships, what was determined, patterns detected. Do NOT include: credentials, passwords, API keys, tokens, or analyst chatter. Structure it as concise facts an analyst would want in a future investigation. Leave empty string if shouldRetain is false."
}`;

/**
 * Call Gemini with candidate models
 */
async function callGemini(promptText, isJson = true) {
    let lastError = null;

    for (const modelName of CANDIDATE_MODELS) {
        try {
            const modelConfig = {
                model: modelName,
                systemInstruction: SYSTEM_PROMPT
            };

            if (isJson) {
                modelConfig.generationConfig = {
                    responseMimeType: "application/json"
                };
            }

            const model = genAI.getGenerativeModel(modelConfig);
            const result = await model.generateContent(promptText);
            const response = await result.response;
            return {
                text: response.text().trim(),
                modelName
            };
        } catch (err) {
            console.warn(`[Gemini] Model ${modelName} failed:`, err.message || err);
            lastError = err;
        }
    }
    throw lastError || new Error('All Gemini model candidates failed');
}

/**
 * Filter and sanitize memory candidate before storing to prevent sensitive data leakage
 */
function sanitizeMemory(text) {
    if (!text || typeof text !== 'string') return null;
    const lower = text.toLowerCase();
    
    const forbidden = ['password', 'passwd', 'api_key', 'apikey', 'secret', 'bearer ', 'token ', 'private_key'];
    for (const term of forbidden) {
        if (lower.includes(term) && !lower.includes('brute-force') && !lower.includes('password spraying')) {
            console.warn(`[Hindsight] Memory contains potentially sensitive keyword '${term}'. Scrubbing.`);
            return null;
        }
    }
    return text.trim();
}

function ensureString(val, fallback = '') {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join('\n');
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
}

// ----------------------------------------------------
// ROUTES
// ----------------------------------------------------

// Root: Serve UI
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. Health & Status Check
app.get(['/api/health', '/health'], async (req, res) => {
    try {
        let geminiStatus = { connected: false, model: null };
        let hindsightStatus = { connected: false, bankId: HINDSIGHT_BANK_ID };

        try {
            const geminiRes = await callGemini('Respond with "OK: Gemini Ready"', false);
            geminiStatus = { connected: true, model: geminiRes.modelName };
        } catch (e) {
            geminiStatus = { connected: false, error: e.message };
        }

        try {
            const recallTest = await hindsight.recall(HINDSIGHT_BANK_ID, "ping test", { budget: "low" });
            hindsightStatus = {
                connected: true,
                bankId: HINDSIGHT_BANK_ID,
                resultsCount: recallTest?.results?.length ?? 0
            };
        } catch (e) {
            hindsightStatus = { connected: false, error: e.message };
        }

        return res.json({
            status: (geminiStatus.connected && hindsightStatus.connected) ? 'healthy' : 'degraded',
            gemini: geminiStatus,
            hindsight: hindsightStatus
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2. Incident Response Pipeline (Extraction -> Recall -> Filter -> Context Assembly -> Gemini -> Retain)
app.post(['/api/analyze', '/analyze'], async (req, res) => {
    try {
        const { incidentText } = req.body;

        if (!incidentText || typeof incidentText !== 'string' || !incidentText.trim()) {
            return res.status(400).json({ error: 'incidentText is required' });
        }

        console.log(`\n=============================================================`);
        console.log(`[PIPELINE START] Incident: "${incidentText}"`);

        // STEP 1: Extract Key Entities and Generate Recall Query
        const extraction = extractKeyEntities(incidentText, sessionState);
        console.log(`[1. ENTITY EXTRACTION]`);
        console.log(`- Extracted Entities:`, extraction.entities);
        console.log(`- Generated Recall Query: "${extraction.recallQuery}"`);

        // Update session state with newly observed entities if present
        if (extraction.categorized.ips.length > 0) {
            sessionState.lastIp = extraction.categorized.ips[0];
        }
        if (extraction.categorized.usernames.length > 0) {
            sessionState.lastAccount = extraction.categorized.usernames[0];
        }

        // STEP 2: Automatic Hindsight Recall
        let rawRecallResults = [];
        let relevantMemories = [];
        try {
            console.log(`[2. HINDSIGHT RECALL] Calling Hindsight on bank "${HINDSIGHT_BANK_ID}"...`);
            const recallResponse = await hindsight.recall(HINDSIGHT_BANK_ID, extraction.recallQuery);
            rawRecallResults = recallResponse?.results || [];
            console.log(`- Raw Memories Retrieved: ${rawRecallResults.length}`);

            // STEP 3: Filter Relevant Memories (Drop unrelated incidents)
            relevantMemories = filterRelevantMemories(rawRecallResults, incidentText, extraction.entities);
            console.log(`[3. MEMORY FILTERING] Relevant Memories Selected: ${relevantMemories.length}`);
            relevantMemories.forEach((m, i) => {
                console.log(`  [Selected ${i + 1}] (${m.scores?.final?.toFixed(3) || 'N/A'}) ${m.text.substring(0, 90)}...`);
            });
        } catch (err) {
            console.warn(`[Hindsight RECALL Warning]: ${err.message}`);
        }

        // STEP 4: Context Assembly — build structured context object and Gemini prompt
        const contextObj = assembleContext({
            incidentText,
            extraction,
            relevantMemories,
            bankId:          HINDSIGHT_BANK_ID,
            recallQuery:     extraction.recallQuery,
            rawRecallCount:  rawRecallResults.length
        });

        const userPrompt = buildGeminiPrompt(contextObj);
        console.log(`[4. CONTEXT ASSEMBLY]`);
        logContextAssembly(contextObj, userPrompt);

        // STEP 5: Send Assembled Context to Gemini LLM
        console.log(`[5. GEMINI LLM REASONING] Generating analysis...`);
        const { text, modelName } = await callGemini(userPrompt, true);

        let parsedJson;
        try {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                parsedJson = JSON.parse(text.substring(firstBrace, lastBrace + 1));
            } else {
                parsedJson = JSON.parse(text);
            }
        } catch (e) {
            console.warn(`[JSON Parse Error]: ${e.message}. Raw text:`, text.substring(0, 200));
            throw new Error(`Failed to parse structured JSON from LLM: ${e.message}`);
        }

        // STEP 6: Memory Evaluation → Structured Record → Hindsight RETAIN
        let retainLog = null;
        let memEvalResult = null;

        {
            // Independent evaluation — does not rely solely on Gemini's shouldRetain
            memEvalResult = evaluateMemory({
                incidentText,
                parsedJson,
                contextObj,
                extraction
            });

            let retainStatus = null;

            if (memEvalResult.shouldRetain && memEvalResult.structuredRecord) {
                try {
                    await hindsight.retain(
                        HINDSIGHT_BANK_ID,
                        memEvalResult.structuredRecord,
                        {
                            context: "Incident Response Investigation",
                            metadata: memEvalResult.metadata
                        }
                    );
                    retainStatus = 'success';
                    retainLog = `Stored: "${memEvalResult.structuredRecord.substring(0, 80)}..."`;
                } catch (err) {
                    retainStatus = `error: ${err.message}`;
                    console.warn(`[Hindsight RETAIN Warning]: ${err.message}`);
                }
            }

            // Always log the evaluation result (RETAIN or SKIP)
            logMemoryEvaluation(memEvalResult, HINDSIGHT_BANK_ID, retainStatus);
        }

        // Format and return response
        let confLevel = (parsedJson.confidenceLevel || parsedJson.confidence || 'medium').toLowerCase();
        if (confLevel.includes('high')) confLevel = 'high';
        else if (confLevel.includes('low')) confLevel = 'low';
        else confLevel = 'medium';


        const retrievalLog = {
            recallQuery:                   contextObj.historicalContext.recallQuery,
            memoriesRetrievedCount:        contextObj.historicalContext.totalRetrieved,
            relevantMemoriesSelectedCount: contextObj.historicalContext.totalSelected,
            contextSentToGemini:           contextObj.hasHistory
                ? contextObj.historicalContext.memories.map(m => `[${m.label}] ${m.text}`).join('\n')
                : '(No relevant historical memories selected)'
        };


        console.log(`[PIPELINE COMPLETE]`);

        return res.json({
            success: true,
            model: modelName,
            retrievalLog: retrievalLog,
            analysis: {
                summary: ensureString(parsedJson.summary, 'Incident analyzed.'),
                evidence: ensureString(parsedJson.evidence, 'Observed evidence from input.'),
                entities: Array.isArray(parsedJson.entities) ? parsedJson.entities : extraction.entities,
                historicalContext: ensureString(parsedJson.historicalContext, (relevantMemories.length > 0 ? relevantMemories.map(m => m.text).join('\n') : 'No relevant historical context retrieved.')),
                assessment: ensureString(parsedJson.assessment, 'No assessment provided.'),
                recommendedInvestigation: ensureString(parsedJson.recommendedInvestigation, 'Review logs.'),
                recommendedResponse: ensureString(parsedJson.recommendedResponse, 'Monitor affected systems.'),
                confidence: ensureString(parsedJson.confidence || confLevel, confLevel),
                confidenceLevel: confLevel,
                missing: ensureString(parsedJson.missing, 'None reported.')
            },
            recalledMemories: relevantMemories,
            retainLog: retainLog,
            memoryEvaluation: memEvalResult ? {
                decision:    memEvalResult.decision,
                valueScore:  memEvalResult.valueScore,
                reasons:     memEvalResult.reasons
            } : null
        });

    } catch (err) {
        console.error('[API /api/analyze Error]:', err);
        return res.status(500).json({
            success: false,
            error: err.message || 'Internal Server Error'
        });
    }
});

// 3. Reset / Clear Bank Memories (For testing clean slate)
app.post(['/api/memory/clear', '/memory/clear'], async (req, res) => {
    try {
        console.log(`[Hindsight] Clearing memories in bank "${HINDSIGHT_BANK_ID}"...`);
        try {
            await hindsight.deleteBank(HINDSIGHT_BANK_ID);
        } catch (e) {}
        await hindsight.createBank(HINDSIGHT_BANK_ID, {
            name: "Incident Response Agent",
            background: "Persistent cybersecurity memory bank for analyzing and correlating security incidents."
        });
        sessionState = { lastIp: null, lastAccount: null, lastThreatType: null };
        return res.json({ success: true, message: `Bank "${HINDSIGHT_BANK_ID}" reset successfully.` });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n=============================================================`);
        console.log(`Incident Response Agent Server running on http://localhost:${PORT}`);
        console.log(`Memory Bank: "${HINDSIGHT_BANK_ID}" on ${HINDSIGHT_BASE_URL}`);
        console.log(`Health Check: http://localhost:${PORT}/api/health`);
        console.log(`=============================================================\n`);
    });
}

export default app;

