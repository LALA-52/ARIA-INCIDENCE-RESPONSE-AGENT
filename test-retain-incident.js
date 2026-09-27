import dotenv from 'dotenv';
dotenv.config();

import { HindsightClient } from '@vectorize-io/hindsight-client';

const apiKey = process.env.HINDSIGHT_API_KEY;
const bankId = process.env.HINDSIGHT_BANK_ID || 'incident-response-agent';
const baseUrl = process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io';

if (!apiKey) {
    console.error('ERROR: HINDSIGHT_API_KEY is not defined.');
    process.exit(1);
}

const client = new HindsightClient({
    baseUrl: baseUrl,
    apiKey: apiKey
});

async function retainIncident() {
    const incidentContent = "Multiple failed login attempts were detected against an administrative account from IP 203.0.113.25.";
    
    console.log(`Calling client.retain on bank: "${bankId}"...`);
    
    try {
        const response = await client.retain(bankId, incidentContent, {
            context: "Security Incident Alert",
            metadata: {
                incident_type: "authentication_failure",
                threat_category: "brute_force",
                source_ip: "203.0.113.25",
                target_account: "admin",
                timestamp: new Date().toISOString()
            }
        });

        console.log('\n--- Retain Result ---');
        console.log(JSON.stringify(response, null, 2));
    } catch (err) {
        console.error('Retain operation failed:', err);
    }
}

retainIncident();
