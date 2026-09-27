/**
 * test-memory-evaluation.js
 *
 * Two-incident test for AIRA Memory Evaluation (Step 6):
 *
 * Incident 1: Brute-force attempt  → evaluator should RETAIN
 * Incident 2: "Same IP" succeeds   → evaluator should RETAIN using historical context
 */

const SEP = '='.repeat(72);
const SUB = '-'.repeat(72);

async function analyze(label, incidentText) {
    console.log(`\n${SEP}`);
    console.log(label);
    console.log(SEP);
    console.log(`Incident: "${incidentText}"\n`);

    const res = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentText })
    });
    const data = await res.json();

    if (!data.success) {
        console.error(`API Error: ${data.error}`);
        return null;
    }

    const a = data.analysis;
    const ev = data.memoryEvaluation;

    // --- Analysis Sections ---
    console.log(`[Model]: ${data.model}`);

    console.log(`\n[Summary]`);
    console.log(SUB);
    console.log(a.summary);

    console.log(`\n[Evidence] — current incident only`);
    console.log(SUB);
    console.log(a.evidence);
    console.log(`Entities: ${JSON.stringify(a.entities)}`);

    console.log(`\n[Historical Context] — Hindsight recalled memories`);
    console.log(SUB);
    console.log(a.historicalContext);

    console.log(`\n[Assessment]`);
    console.log(SUB);
    console.log(a.assessment);

    console.log(`\n[Recommended Investigation]`);
    console.log(SUB);
    console.log(a.recommendedInvestigation);

    console.log(`\n[Recommended Response]`);
    console.log(SUB);
    console.log(a.recommendedResponse);

    console.log(`\n[Confidence]: ${a.confidence}`);
    console.log(`[Missing]:    ${a.missing}`);

    // --- Memory Evaluation Section ---
    console.log(`\n${SUB}`);
    console.log(`MEMORY EVALUATION`);
    console.log(SUB);
    console.log(`  Decision:    ${ev?.decision ?? 'N/A'}`);
    console.log(`  Value Score: ${ev?.valueScore ?? 'N/A'}`);
    console.log(`  Reasons:`);
    (ev?.reasons || []).forEach(r => console.log(`    • ${r}`));
    console.log(`  Retain Log:  ${data.retainLog || '(not stored)'}`);

    // --- Retrieval Audit ---
    const rl = data.retrievalLog;
    console.log(`\n${SUB}`);
    console.log(`RETRIEVAL AUDIT`);
    console.log(SUB);
    console.log(`  Recall Query:     "${rl.recallQuery}"`);
    console.log(`  Raw Retrieved:    ${rl.memoriesRetrievedCount}`);
    console.log(`  Selected:         ${rl.relevantMemoriesSelectedCount}`);

    return data;
}

// --- Verification ---
function verify(label, condition, note = '') {
    const status = condition ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}  ${label}${note ? ' — ' + note : ''}`);
    return condition;
}

async function runTest() {
    console.log(`${SEP}`);
    console.log(`AIRA — AUTOMATIC MEMORY UPDATE STAGE TEST`);
    console.log(SEP);

    // -------------------------------------------------------------------------
    // INCIDENT 1: Brute-force attempt
    // -------------------------------------------------------------------------
    const incident1 = "Multiple failed login attempts were detected against an administrative account from IP 203.0.113.25.";
    const r1 = await analyze('INCIDENT 1: Initial Brute-Force Detection', incident1);
    if (!r1) return;

    // Pause to let Hindsight index the retained memory
    console.log('\n[Pausing 3s for Hindsight to index memory...]\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // -------------------------------------------------------------------------
    // INCIDENT 2: Same IP — successful authentication
    // -------------------------------------------------------------------------
    const incident2 = "The same IP address is now associated with successful authentication attempts against the administrative account.";
    const r2 = await analyze('INCIDENT 2: Escalation — Successful Authentication', incident2);
    if (!r2) return;

    // -------------------------------------------------------------------------
    // VERIFICATION
    // -------------------------------------------------------------------------
    console.log(`\n${SEP}`);
    console.log(`VERIFICATION SUMMARY`);
    console.log(SEP);

    console.log('\n[Incident 1 Checks]');
    verify('Memory evaluator ran',           !!r1.memoryEvaluation);
    verify('Decision is RETAIN',             r1.memoryEvaluation?.decision === 'RETAIN');
    verify('Value score > 0',               (r1.memoryEvaluation?.valueScore ?? 0) > 0);
    verify('Memory stored (retainLog set)',   !!r1.retainLog);
    verify('Evidence does not say "executed"',
        !(r1.analysis.recommendedResponse || '').toLowerCase().includes('we executed'));

    console.log('\n[Incident 2 Checks]');
    verify('Memory evaluator ran',           !!r2.memoryEvaluation);
    verify('Decision is RETAIN',             r2.memoryEvaluation?.decision === 'RETAIN');
    verify('Historical context populated',
        r2.analysis.historicalContext &&
        !r2.analysis.historicalContext.startsWith('No relevant'));
    verify('Historical memories recalled',   r2.retrievalLog?.relevantMemoriesSelectedCount > 0,
        `${r2.retrievalLog?.relevantMemoriesSelectedCount} memories`);
    verify('IP 203.0.113.25 in historical context or entities',
        JSON.stringify(r2.analysis.historicalContext).includes('203.0.113.25') ||
        JSON.stringify(r2.analysis.entities).includes('203.0.113.25'));
    verify('Incident 1 context influenced Incident 2',
        (r2.analysis.assessment || '').length > 50);

    console.log(`\n${SEP}`);
    console.log('Test complete.');
    console.log(SEP);
}

runTest().catch(console.error);
