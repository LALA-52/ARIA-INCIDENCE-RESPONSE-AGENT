import dotenv from 'dotenv';
dotenv.config();

import { HindsightClient } from '@vectorize-io/hindsight-client';

const apiKey = process.env.HINDSIGHT_API_KEY;
const bankId = process.env.HINDSIGHT_BANK_ID || 'incident-response-agent';
const baseUrl = process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io';

console.log('Testing Hindsight Cloud at:', baseUrl);
console.log('API Key length:', apiKey ? apiKey.length : 0);
console.log('Bank ID:', bankId);

const client = new HindsightClient({
    baseUrl: baseUrl,
    apiKey: apiKey
});

async function testHindsight() {
    try {
        console.log(`\n1. Creating or ensuring bank "${bankId}"...`);
        try {
            await client.createBank(bankId, {
                name: "Incident Response Agent",
                background: "Persistent cybersecurity memory bank for analyzing and correlating security incidents, threat indicators, and investigation context."
            });
            console.log(`Bank "${bankId}" created/verified.`);
        } catch (e) {
            console.log(`Note on createBank: ${e.message || e}`);
        }

        console.log(`\n2. Testing RETAIN in bank "${bankId}"...`);
        const incidentFact = "Incident Reference INC-8492: Administrative account targeted by multiple failed authentication attempts from unfamiliar external IP 198.51.100.23. Observed brute-force pattern.";
        const retainRes = await client.retain(bankId, incidentFact, {
            context: "Authentication Security Logs",
            metadata: {
                incident_id: "INC-8492",
                ip: "198.51.100.23",
                target_account: "admin",
                threat_type: "brute-force"
            }
        });
        console.log('Retain response:', JSON.stringify(retainRes, null, 2));

        console.log(`\n3. Testing RECALL in bank "${bankId}"...`);
        const recallQuery = "198.51.100.23 failed login admin";
        const recallRes = await client.recall(bankId, recallQuery);
        console.log('Recall response:', JSON.stringify(recallRes, null, 2));

    } catch (err) {
        console.error('Hindsight test error:', err);
    }
}

testHindsight();
