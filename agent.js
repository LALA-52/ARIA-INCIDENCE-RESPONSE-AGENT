/**
 * Incident Response Agent Client
 * Communicates with the backend server running Google Gemini LLM and Hindsight Memory.
 */

class IncidentResponseAgent {
    constructor() {
        this.apiBase = '/api';
    }

    /**
     * Check backend health, Gemini LLM connection, and Hindsight Memory bank status
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this.apiBase}/health`);
            const data = await response.json();
            return data;
        } catch (err) {
            console.error('[Agent] Health check error:', err);
            return {
                status: 'error',
                message: err.message
            };
        }
    }

    /**
     * Send incident to backend -> Hindsight Recall -> Gemini LLM -> Hindsight Retain -> Structured Result
     */
    async analyzeIncident(incidentText) {
        try {
            const response = await fetch(`${this.apiBase}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ incidentText })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP error ${response.status}`);
            }

            const data = await response.json();
            
            return {
                success: true,
                model: data.model,
                analysis: data.analysis,
                entities: data.analysis?.entities || data.entities || [],
                recalledMemories: data.recalledMemories || [],
                retrievalLog: data.retrievalLog || null,
                recallLog: data.retrievalLog || data.recallLog || [],
                retainLog: data.retainLog || null,
                memoryEvaluation: data.memoryEvaluation || null
            };
        } catch (err) {
            console.error('[Agent] Analysis error:', err);
            return {
                success: false,
                error: err.message,
                analysis: {
                    summary: "Error communicating with backend service.",
                    evidence: "N/A",
                    assessment: `Failed to complete analysis pipeline: ${err.message}`,
                    historicalContext: "N/A",
                    recommendedInvestigation: "Verify server and API keys.",
                    recommendedResponse: "Check server logs for error details.",
                    confidence: "low",
                    confidenceLevel: "low",
                    missing: "Backend connectivity."
                },
                entities: [],
                recalledMemories: [],
                recallLog: [],
                retainLog: null
            };
        }
    }

    /**
     * Reset Hindsight memory bank for fresh test runs
     */
    async clearMemory() {
        try {
            const response = await fetch(`${this.apiBase}/memory/clear`, {
                method: 'POST'
            });
            return await response.json();
        } catch (err) {
            console.error('[Agent] Reset memory error:', err);
            return { success: false, error: err.message };
        }
    }
}

// Export for app.js
window.IncidentResponseAgent = IncidentResponseAgent;
