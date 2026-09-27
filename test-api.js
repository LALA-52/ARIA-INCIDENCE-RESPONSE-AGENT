async function runTests() {
    console.log('--- 1. Testing /api/health ---');
    try {
        const healthRes = await fetch('http://localhost:8000/api/health');
        const healthData = await healthRes.json();
        console.log('Health Response Status:', healthRes.status);
        console.log('Health Data:', JSON.stringify(healthData, null, 2));
    } catch (e) {
        console.error('Health Check Failed:', e);
    }

    console.log('\n--- 2. Testing /api/analyze with Incident ---');
    const testIncident = "Multiple failed login attempts were detected against an administrative account from an unfamiliar IP address.";
    try {
        const analyzeRes = await fetch('http://localhost:8000/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ incidentText: testIncident })
        });
        const analyzeData = await analyzeRes.json();
        console.log('Analyze Response Status:', analyzeRes.status);
        console.log('Analyze Data:', JSON.stringify(analyzeData, null, 2));
    } catch (e) {
        console.error('Analyze Test Failed:', e);
    }
}

runTests();
