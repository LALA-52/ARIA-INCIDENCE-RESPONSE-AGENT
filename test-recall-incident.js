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

async function runRecallTest() {
    const query = "What previous incident involved IP address 203.0.113.25?";
    console.log(`Executing Hindsight Recall query on bank "${bankId}"...`);
    console.log(`Query: "${query}"\n`);

    try {
        const response = await client.recall(bankId, query);
        
        console.log('--- RECALL RESPONSE METADATA ---');
        console.log(`Success: ${Array.isArray(response?.results) ? 'true' : 'false'}`);
        console.log(`Results Count: ${response?.results?.length ?? 0}`);

        if (response?.results && response.results.length > 0) {
            console.log('\n--- HISTORICAL MEMORY (EXTRACTED) ---');
            response.results.forEach((mem, index) => {
                console.log(`\n[Memory #${index + 1}]`);
                console.log(`Memory ID: ${mem.id}`);
                console.log(`Content: ${mem.text}`);
                console.log(`Context: ${mem.context || 'N/A'}`);
                console.log(`Entities: ${JSON.stringify(mem.entities || [])}`);
                console.log(`Metadata: ${JSON.stringify(mem.metadata || {})}`);
                console.log(`Scores: ${JSON.stringify(mem.scores || {})}`);
            });
        } else {
            console.log('No memories returned.');
        }

    } catch (err) {
        console.error('Recall request failed:', err);
    }
}

runRecallTest();
