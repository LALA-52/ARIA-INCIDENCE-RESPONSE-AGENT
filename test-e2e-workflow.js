async function runFullTest() {
    console.log('============================================================');
    console.log('STARTING HINDSIGHT + GEMINI INTEGRATION TESTS');
    console.log('============================================================\n');

    // 1. Health Check
    console.log('--- TEST 1: Health & Connectivity Check ---');
    const healthRes = await fetch('http://localhost:8000/api/health');
    const healthData = await healthRes.json();
    console.log('Health Status:', healthData.status);
    console.log('Gemini Status:', JSON.stringify(healthData.gemini));
    console.log('Hindsight Status:', JSON.stringify(healthData.hindsight));

    // 2. Incident 1: Initial failed logins
    console.log('\n--- TEST 2: Incident 1 (Initial Brute-Force Detection) ---');
    const incident1 = "Multiple failed login attempts were detected against an administrative account from an unfamiliar IP address 198.51.100.23.";
    console.log('Input:', incident1);

    const res1 = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentText: incident1 })
    });
    const data1 = await res1.json();
    console.log('\n[Incident 1 Analysis]');
    console.log('Summary:', data1.analysis.summary);
    console.log('Evidence:', data1.analysis.evidence);
    console.log('Assessment:', data1.analysis.assessment);
    console.log('Historical Context:', data1.analysis.historicalContext);
    console.log('Retain Log:', data1.retainLog);

    // Wait a brief moment for indexing in Hindsight Cloud
    console.log('\nWaiting 3 seconds for Hindsight memory indexing...');
    await new Promise(r => setTimeout(r, 3000));

    // 3. Incident 2: Related incident (Successful login from same IP)
    console.log('\n--- TEST 3: Incident 2 (Related Incident - Successful Login from Same IP) ---');
    const incident2 = "The same IP address 198.51.100.23 is now associated with successful authentication attempts against the admin account.";
    console.log('Input:', incident2);

    const res2 = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentText: incident2 })
    });
    const data2 = await res2.json();
    console.log('\n[Incident 2 Analysis]');
    console.log('Summary:', data2.analysis.summary);
    console.log('Recalled Memories Count:', data2.recalledMemories?.length);
    if (data2.recalledMemories?.length > 0) {
        data2.recalledMemories.forEach((m, idx) => {
            console.log(`  - Recalled [${idx + 1}]:`, m.text);
        });
    }
    console.log('Historical Context in Output:', data2.analysis.historicalContext);
    console.log('Assessment:', data2.analysis.assessment);
    console.log('Recommended Response:', data2.analysis.recommendedResponse);
    console.log('Confidence Level:', data2.analysis.confidenceLevel);

    console.log('\n============================================================');
    console.log('INTEGRATION TESTS COMPLETE');
    console.log('============================================================');
}

runFullTest().catch(console.error);
