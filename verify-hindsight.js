import dotenv from 'dotenv';
dotenv.config();

import { HindsightClient } from '@vectorize-io/hindsight-client';

async function verifyHindsight() {
    const baseUrl = process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io';
    const bankId = process.env.HINDSIGHT_BANK_ID || 'incident-response-agent';
    const apiKey = process.env.HINDSIGHT_API_KEY;

    if (!apiKey) {
        console.log(JSON.stringify({
            apiKeyConfigured: false,
            error: "HINDSIGHT_API_KEY environment variable is missing"
        }, null, 2));
        return;
    }

    // 1. Direct REST call to GET /v1/default/banks/{bank_id}/config
    const endpoint = `${baseUrl}/v1/default/banks/${bankId}/config`;
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });

    const httpStatus = response.status;
    const responseBody = await response.json().catch(() => null);

    // 2. Also check SDK recall
    const client = new HindsightClient({
        baseUrl: baseUrl,
        apiKey: apiKey
    });

    let sdkRecallStatus = null;
    try {
        const recallRes = await client.recall(bankId, "authentication test", { budget: "low" });
        sdkRecallStatus = {
            success: true,
            resultsReturned: recallRes?.results?.length ?? 0
        };
    } catch (e) {
        sdkRecallStatus = {
            success: false,
            error: e.message
        };
    }

    const verificationResult = {
        apiKeyLoadedFromEnv: true,
        apiKeyCharacterCount: apiKey.length,
        baseUrlConfigured: baseUrl,
        bankId: bankId,
        httpStatus: httpStatus,
        authenticationSuccess: response.ok,
        bankExists: response.ok,
        bankConfigResponse: responseBody,
        sdkRecallVerification: sdkRecallStatus
    };

    console.log(JSON.stringify(verificationResult, null, 2));
}

verifyHindsight();
