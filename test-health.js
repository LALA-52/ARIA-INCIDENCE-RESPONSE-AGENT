import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY environment variable is missing!');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Prioritize responsive, active models with fallback
export const CANDIDATE_MODELS = [
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
    'gemini-pro-latest'
];

export async function testConnection(testPrompt = 'Say "OK: Incident Response Agent Connected"') {
    for (const modelName of CANDIDATE_MODELS) {
        try {
            console.log(`Testing model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(testPrompt);
            const response = await result.response;
            const text = response.text().trim();
            console.log(`SUCCESS! [${modelName}] -> ${text}`);
            return {
                success: true,
                model: modelName,
                response: text
            };
        } catch (err) {
            console.warn(`Model [${modelName}] error: ${err.message || err}`);
        }
    }
    return {
        success: false,
        error: 'All candidate models failed'
    };
}

if (process.argv[1]?.endsWith('test-health.js')) {
    testConnection().then(res => {
        console.log('Result:', JSON.stringify(res, null, 2));
        process.exit(res.success ? 0 : 1);
    });
}
