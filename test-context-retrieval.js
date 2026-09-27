async function runContextRetrievalTest() {
    console.log('========================================================================');
    console.log('TESTING CONTEXT RETRIEVAL USING HINDSIGHT RECALL');
    console.log('========================================================================\n');

    // 1. Incident 1: Seed / verify the incident involving 203.0.113.25
    console.log('STEP 1: Submitting initial incident for IP 203.0.113.25...');
    const incident1 = "Multiple failed login attempts were detected against an administrative account from IP 203.0.113.25.";
    console.log(`Input: "${incident1}"\n`);

    const res1 = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentText: incident1 })
    });
    const data1 = await res1.json();
    console.log('Incident 1 Processed:');
    console.log('- Summary:', data1.analysis?.summary);
    console.log('- Retain Log:', data1.retainLog);

    console.log('\nWaiting 3 seconds for Hindsight memory indexing...\n');
    await new Promise(r => setTimeout(r, 3000));

    // 2. Incident 2: Contextual query referencing "the same IP address"
    console.log('STEP 2: Submitting follow-up incident referencing "The same IP address"...');
    const incident2 = "The same IP address is now associated with successful authentication attempts against an administrative account.";
    console.log(`Input: "${incident2}"\n`);

    const res2 = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentText: incident2 })
    });
    const data2 = await res2.json();

    console.log('========================================================================');
    console.log('RETRIEVAL & ANALYSIS LOGS');
    console.log('========================================================================');
    console.log('1. Generated Recall Query:', data2.retrievalLog?.recallQuery);
    console.log('2. Raw Memories Retrieved from Hindsight:', data2.retrievalLog?.memoriesRetrievedCount);
    console.log('3. Relevant Memories Selected:', data2.retrievalLog?.relevantMemoriesSelectedCount);
    console.log('\n4. Context Sent to Gemini:\n', data2.retrievalLog?.contextSentToGemini);
    
    console.log('\n========================================================================');
    console.log('GEMINI STRUCTURED ANALYSIS (VERIFYING SEPARATION OF EVIDENCE & HISTORY)');
    console.log('========================================================================');
    console.log('[OBSERVED EVIDENCE (Current Facts)]:\n', data2.analysis?.evidence);
    console.log('\n[EXTRACTED ENTITIES]:\n', data2.analysis?.entities);
    console.log('\n[HISTORICAL CONTEXT (Recalled from Hindsight)]:\n', data2.analysis?.historicalContext);
    console.log('\n[ASSESSMENT (Correlated Threat Interpretation)]:\n', data2.analysis?.assessment);
    console.log('\n[RECOMMENDED INVESTIGATION]:\n', data2.analysis?.recommendedInvestigation);
    console.log('\n[RECOMMENDED RESPONSE]:\n', data2.analysis?.recommendedResponse);
    console.log('\n[CONFIDENCE]:\n', data2.analysis?.confidence);
    console.log('\n[MISSING INFORMATION]:\n', data2.analysis?.missing);
}

runContextRetrievalTest().catch(console.error);
