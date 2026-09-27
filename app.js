document.addEventListener('DOMContentLoaded', async () => {
    const agent = new window.IncidentResponseAgent();

    let totalRecalled = 0;
    let totalStored = 0;

    // DOM Elements
    const inputArea = document.getElementById('incident-input');
    const btnAnalyze = document.getElementById('btn-analyze');
    const btnReset = document.getElementById('btn-reset');
    const scenarioSelector = document.getElementById('scenario-selector');
    const conversationHistory = document.getElementById('conversation-history');
    
    // Output Elements
    const outSummary = document.getElementById('out-summary');
    const outEvidence = document.getElementById('out-evidence');
    const outHistorical = document.getElementById('out-historical');
    const outAssessment = document.getElementById('out-assessment');
    const outInvestigation = document.getElementById('out-investigation');
    const outResponse = document.getElementById('out-response');
    const outMissing = document.getElementById('out-missing');
    const confidenceBadge = document.getElementById('confidence-badge');
    
    // Memory Elements
    const metricStored = document.getElementById('metric-stored');
    const metricRecalled = document.getElementById('metric-recalled');
    const memoryLog = document.getElementById('memory-log');

    // Scenarios for testing persistent memory workflow
    const scenarios = {
        scenario1: "Multiple failed login attempts were detected against an administrative account from an unfamiliar IP address 198.51.100.23.",
        scenario2: "The same IP address 198.51.100.23 is now associated with successful authentication attempts against the admin account.",
        scenario3: "A workstation generated an alert for a suspicious PowerShell process.",
        scenario4: "Alert: Repeated failed logins against an administrative account from 198.51.100.23."
    };

    // Check backend health & Hindsight on startup
    const health = await agent.checkHealth();
    if (health && health.status === 'healthy') {
        addMessageToHistory('agent', 'System', `Connected to Gemini LLM (${health.gemini?.model}) and Hindsight Memory Bank ("${health.hindsight?.bankId}").`);
        addMemoryLog('store', `Hindsight Bank "${health.hindsight?.bankId}" connected and active.`);
    } else {
        addMessageToHistory('agent', 'System', `System status: ${health?.status || 'Connecting...'}`);
    }

    scenarioSelector.addEventListener('change', (e) => {
        const val = e.target.value;
        if (scenarios[val]) {
            inputArea.value = scenarios[val];
        } else {
            inputArea.value = "";
        }
    });

    btnReset.addEventListener('click', async () => {
        btnReset.disabled = true;
        btnReset.textContent = 'Resetting...';
        try {
            await agent.clearMemory();
            totalRecalled = 0;
            totalStored = 0;
            metricRecalled.textContent = '0';
            metricStored.textContent = '0';
            conversationHistory.innerHTML = '';
            memoryLog.innerHTML = '';
            inputArea.value = '';
            clearAnalysis();
            addMessageToHistory('agent', 'System', 'Environment and Hindsight memory bank reset.');
            addMemoryLog('recall', 'Memory bank cleared.');
        } finally {
            btnReset.disabled = false;
            btnReset.textContent = 'Reset Environment';
        }
    });

    btnAnalyze.addEventListener('click', async () => {
        const text = inputArea.value.trim();
        if (!text) return;

        // Add user message to history
        addMessageToHistory('user', 'Analyst', text);
        inputArea.value = '';

        // Indicate loading
        btnAnalyze.disabled = true;
        btnAnalyze.textContent = 'Querying Hindsight & Gemini...';
        confidenceBadge.textContent = 'ANALYZING...';
        confidenceBadge.className = 'badge neutral';

        try {
            // Run full agent workflow: Recall -> Context -> Gemini -> Retain
            const result = await agent.analyzeIncident(text);
            
            // Update UI with structured analysis
            renderAnalysis(result);
            
            // Update Memory UI & Logs
            if (result.recalledMemories && result.recalledMemories.length > 0) {
                totalRecalled += result.recalledMemories.length;
                metricRecalled.textContent = totalRecalled;
                result.recalledMemories.forEach(mem => {
                    addMemoryLog('recall', `[RECALL] ${mem.text}`);
                });
            } else {
                addMemoryLog('recall', `[RECALL] No matching memories found in bank.`);
            }

            if (result.retainLog) {
                totalStored += 1;
                metricStored.textContent = totalStored;
                addMemoryLog('store', `[RETAIN] ${result.retainLog}`);
            } else if (result.memoryEvaluation && result.memoryEvaluation.decision === 'SKIP') {
                addMemoryLog('store', `[MEMORY EVALUATION] Skipped storing — Insufficient long-term significance.`);
            }

            // Add agent response to conversation history
            addMessageToHistory('agent', 'Incident Response Agent', `Analysis completed using ${result.model || 'Gemini'}. Findings recorded in the operational dashboard.`);
        } finally {
            btnAnalyze.disabled = false;
            btnAnalyze.textContent = 'Analyze Incident';
        }
    });

    function addMessageToHistory(role, name, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        msgDiv.innerHTML = `
            <div class="message-header">${name}</div>
            <div class="message-body">${text}</div>
        `;
        conversationHistory.appendChild(msgDiv);
        conversationHistory.scrollTop = conversationHistory.scrollHeight;
    }

    function renderAnalysis(result) {
        const { analysis, entities, recalledMemories } = result;

        outSummary.textContent = analysis.summary || "No summary provided.";
        outSummary.classList.remove('text-muted');
        
        let evidenceText = analysis.evidence || '';
        if (entities && entities.length > 0) {
            evidenceText += `\n\nObserved Entities: ${entities.join(', ')}`;
        }
        outEvidence.textContent = evidenceText || "No explicit evidence extracted.";
        outEvidence.classList.remove('text-muted');

        // Historical Context Display (strictly separated from current evidence)
        let histText = analysis.historicalContext || '';
        if (recalledMemories && recalledMemories.length > 0) {
            histText += '\n\nRecalled Memories from Hindsight:';
            recalledMemories.forEach((m, idx) => {
                histText += `\n- [Memory ${idx + 1}] ${m.text}`;
            });
        }
        if (!histText || histText.trim() === '') {
            histText = "No relevant historical context retrieved.";
            outHistorical.classList.add('text-muted');
        } else {
            outHistorical.classList.remove('text-muted');
        }
        outHistorical.textContent = histText;

        outAssessment.textContent = analysis.assessment || "No assessment provided.";
        outAssessment.classList.remove('text-muted');
        
        outInvestigation.textContent = analysis.recommendedInvestigation || "None";
        outInvestigation.classList.remove('text-muted');
        
        outResponse.textContent = analysis.recommendedResponse || "None";
        outResponse.classList.remove('text-muted');

        outMissing.textContent = analysis.missing || "None";
        outMissing.classList.remove('text-muted');

        // Update confidence badge
        const level = (analysis.confidenceLevel || analysis.confidence || 'medium').toLowerCase();
        let badgeClass = 'medium';
        if (level.includes('high')) badgeClass = 'high';
        else if (level.includes('low')) badgeClass = 'low';

        confidenceBadge.textContent = (analysis.confidence || badgeClass).toUpperCase();
        confidenceBadge.className = `badge ${badgeClass}`;
    }

    function clearAnalysis() {
        outSummary.textContent = "No incident loaded.";
        outEvidence.textContent = "No evidence extracted.";
        outHistorical.textContent = "No historical context retrieved.";
        outAssessment.textContent = "Awaiting analysis...";
        outInvestigation.textContent = "None";
        outResponse.textContent = "None";
        outMissing.textContent = "None";
        
        const els = [outSummary, outEvidence, outHistorical, outAssessment, outInvestigation, outResponse, outMissing];
        els.forEach(el => el.classList.add('text-muted'));

        confidenceBadge.textContent = "WAITING";
        confidenceBadge.className = "badge neutral";
    }

    function addMemoryLog(type, text) {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        
        logEntry.innerHTML = `
            <span class="timestamp">[${time}]</span>
            <span class="log-text">${text}</span>
        `;
        
        memoryLog.prepend(logEntry);
    }
});
