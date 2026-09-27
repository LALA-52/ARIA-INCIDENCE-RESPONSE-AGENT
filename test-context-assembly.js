const SEP = '='.repeat(72);
const SUB = '-'.repeat(72);

async function runContextAssemblyTest() {
    console.log(`${SEP}`);
    console.log('CONTEXT ASSEMBLY STAGE TEST');
    console.log(`${SEP}\n`);

    // --- Incident to submit ---
    const relatedIncident = "A new alert was raised: IP 203.0.113.25 has now successfully authenticated against the admin account and executed several commands.";

    console.log('Test Incident (related to previously stored memory):');
    console.log(`"${relatedIncident}"\n`);

    const res = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentText: relatedIncident })
    });
    const data = await res.json();

    if (!data.success) {
        console.error('API Error:', data.error);
        return;
    }

    // --- Retrieval / Assembly Audit ---
    console.log(`\n${SEP}`);
    console.log('RETRIEVAL & CONTEXT ASSEMBLY AUDIT');
    console.log(SEP);
    console.log(`Recall Query Sent to Hindsight:  "${data.retrievalLog.recallQuery}"`);
    console.log(`Memories Retrieved (raw):         ${data.retrievalLog.memoriesRetrievedCount}`);
    console.log(`Memories Selected (relevant):     ${data.retrievalLog.relevantMemoriesSelectedCount}`);
    console.log(`\nContext Sent to Gemini (Historical Section):\n${SUB}`);
    console.log(data.retrievalLog.contextSentToGemini);

    // --- Gemini Response Sections ---
    const a = data.analysis;

    console.log(`\n${SEP}`);
    console.log('GEMINI STRUCTURED RESPONSE');
    console.log(SEP);

    console.log(`\n[Incident Summary]`);
    console.log(SUB);
    console.log(a.summary);

    console.log(`\n[Evidence] — Observed directly in current incident`);
    console.log(SUB);
    console.log(a.evidence);
    console.log(`Entities: ${JSON.stringify(a.entities)}`);

    console.log(`\n[Historical Context] — Recalled from Hindsight (NOT current evidence)`);
    console.log(SUB);
    console.log(a.historicalContext);

    console.log(`\n[Assessment] — Agent inference combining evidence + history`);
    console.log(SUB);
    console.log(a.assessment);

    console.log(`\n[Recommended Investigation]`);
    console.log(SUB);
    console.log(a.recommendedInvestigation);

    console.log(`\n[Recommended Response]`);
    console.log(SUB);
    console.log(a.recommendedResponse);

    console.log(`\n[Confidence]`);
    console.log(SUB);
    console.log(a.confidence);

    console.log(`\n[Missing Information]`);
    console.log(SUB);
    console.log(a.missing);

    console.log(`\n[LLM Model Used]: ${data.model}`);
    console.log(`[Retain Log]:     ${data.retainLog || 'Not retained this cycle'}`);

    // --- Verification Checks ---
    console.log(`\n${SEP}`);
    console.log('VERIFICATION');
    console.log(SUB);
    const historicalInEvidence = (a.evidence || '').toLowerCase().includes('memory')
        || (a.evidence || '').toLowerCase().includes('historical');
    console.log(`Evidence section contaminated with historical claims: ${historicalInEvidence ? 'FAIL' : 'PASS'}`);
    console.log(`Historical context section populated:                 ${a.historicalContext && !a.historicalContext.startsWith('No relevant') ? 'PASS' : 'WARN'}`);
    console.log(`IP 203.0.113.25 appears in entities or evidence:      ${JSON.stringify(a.entities).includes('203.0.113.25') || (a.evidence || '').includes('203.0.113.25') ? 'PASS' : 'WARN'}`);
    console.log(`Historical context treats memory as past (not now):   ${!(a.historicalContext || '').toLowerCase().includes('currently') ? 'PASS' : 'WARN'}`);
}

runContextAssemblyTest().catch(console.error);
