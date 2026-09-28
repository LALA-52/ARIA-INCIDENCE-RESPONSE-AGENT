/* ============================================================
   ARIA Dashboard — app.js
   Wires all views, navigation, and backend calls together.
   Preserves ALL existing IDs used by agent.js backend client.
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
    const agent = new window.IncidentResponseAgent();

    // ── State ─────────────────────────────────────────────────
    let totalRecalled  = 0;
    let totalStored    = 0;
    let totalIncidents = 0;
    const incidentLog  = [];   // { time, summary, confidence, recalled, retained }
    const retainedLog  = [];   // { time, text }
    const recalledLog  = [];   // { time, text }

    // ── DOM: Navigation ───────────────────────────────────────
    const navItems      = document.querySelectorAll('.nav-item');
    const views         = document.querySelectorAll('.view');
    const topbarSection = document.getElementById('topbar-section');

    // ── DOM: Header ───────────────────────────────────────────
    const btnReset        = document.getElementById('btn-reset');
    const btnResetSettings= document.getElementById('btn-reset-settings');
    const statusDot       = document.getElementById('status-dot');
    const statusLabel     = document.getElementById('status-label');
    const modelNameDisplay= document.getElementById('model-name-display');

    // ── DOM: Agent Console ────────────────────────────────────
    const inputArea          = document.getElementById('incident-input');
    const btnAnalyze         = document.getElementById('btn-analyze');
    const scenarioSelector   = document.getElementById('scenario-selector');
    const conversationHistory= document.getElementById('conversation-history');
    const confidenceBadge    = document.getElementById('confidence-badge');
    const analysisEmpty      = document.getElementById('analysis-empty-state');
    const analysisSections   = document.getElementById('analysis-sections');
    const outSummary         = document.getElementById('out-summary');
    const outEvidence        = document.getElementById('out-evidence');
    const outHistorical      = document.getElementById('out-historical');
    const outAssessment      = document.getElementById('out-assessment');
    const outInvestigation   = document.getElementById('out-investigation');
    const outResponse        = document.getElementById('out-response');
    const outMissing         = document.getElementById('out-missing');

    // ── DOM: Memory ───────────────────────────────────────────
    const metricRecalled = document.getElementById('metric-recalled');
    const metricStored   = document.getElementById('metric-stored');
    const memoryLog      = document.getElementById('memory-log');

    // ── DOM: Overview KPIs ────────────────────────────────────
    const kpiIncidents     = document.getElementById('kpi-incidents');
    const kpiRecalled      = document.getElementById('kpi-recalled');
    const kpiStored        = document.getElementById('kpi-stored');
    const kpiHindsight     = document.getElementById('kpi-hindsight-status');
    const overviewLastAnalysis  = document.getElementById('overview-last-analysis');
    const overviewMemoryFeed    = document.getElementById('overview-memory-feed');

    // ── DOM: Incidents ────────────────────────────────────────
    const incidentCount   = document.getElementById('incident-count');
    const incidentsEmpty  = document.getElementById('incidents-empty');
    const incidentTable   = document.getElementById('incident-table');
    const incidentTbody   = document.getElementById('incident-tbody');

    // ── DOM: Memory Bank ──────────────────────────────────────
    const memoryCount     = document.getElementById('memory-count');
    const retainedCount   = document.getElementById('retained-count');
    const recalledCount   = document.getElementById('recalled-count');
    const retainedList    = document.getElementById('retained-list');
    const recalledList    = document.getElementById('recalled-list');

    // ── DOM: Settings ─────────────────────────────────────────
    const settingGemini         = document.getElementById('setting-gemini');
    const settingHindsight      = document.getElementById('setting-hindsight');
    const settingBankId         = document.getElementById('setting-bankid');
    const settingModel          = document.getElementById('setting-model');
    const settingsSessionCount  = document.getElementById('settings-session-count');
    const settingsRetainedCount = document.getElementById('settings-retained-count');
    const btnHealthCheck        = document.getElementById('btn-health-check');

    // ══════════════════════════════════════════════════════════
    // NAVIGATION
    // ══════════════════════════════════════════════════════════
    window.switchView = function(viewName) {
        navItems.forEach(n => n.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));

        const navEl  = document.getElementById(`nav-${viewName}`);
        const viewEl = document.getElementById(`view-${viewName}`);

        if (navEl)  navEl.classList.add('active');
        if (viewEl) viewEl.classList.add('active');

        const labels = {
            overview:  'Overview',
            agent:     'Agent Console',
            incidents: 'Incidents',
            memory:    'Memory Bank',
            settings:  'Settings'
        };
        if (topbarSection) topbarSection.textContent = labels[viewName] || viewName;
    };

    navItems.forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            const view = item.dataset.view;
            if (view) switchView(view);
        });
    });

    // Sidebar collapse
    const sidebar       = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarMobile = document.getElementById('sidebar-toggle-mobile');

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
    }
    if (sidebarMobile) {
        sidebarMobile.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
    }

    // ══════════════════════════════════════════════════════════
    // TEST SCENARIOS
    // ══════════════════════════════════════════════════════════
    const scenarios = {
        scenario1: 'Multiple failed login attempts were detected against an administrative account from an unfamiliar IP address 198.51.100.23.',
        scenario2: 'The same IP address 198.51.100.23 is now associated with successful authentication attempts against the admin account.',
        scenario3: 'A workstation generated an alert for a suspicious PowerShell process spawned from WINWORD.EXE.',
        scenario4: 'Alert: Repeated failed logins against an administrative account from 198.51.100.23.'
    };

    scenarioSelector && scenarioSelector.addEventListener('change', e => {
        if (scenarios[e.target.value]) inputArea.value = scenarios[e.target.value];
        else inputArea.value = '';
    });

    // ══════════════════════════════════════════════════════════
    // HEALTH CHECK
    // ══════════════════════════════════════════════════════════
    async function runHealthCheck() {
        const health = await agent.checkHealth();

        const isHealthy  = health && health.status === 'healthy';
        const isDegraded = health && health.status === 'degraded';

        // Sidebar status
        statusDot.className   = 'status-dot ' + (isHealthy ? 'healthy' : isDegraded ? 'degraded' : 'error');
        statusLabel.textContent = isHealthy ? 'Operational' : isDegraded ? 'Degraded' : 'Error';

        // Model tag
        if (health && health.gemini && health.gemini.model) {
            modelNameDisplay.textContent = health.gemini.model;
        }

        // KPI
        kpiHindsight.textContent = isHealthy ? 'Active' : isDegraded ? 'Degraded' : 'Error';

        // Settings panel
        if (settingGemini) {
            settingGemini.textContent = health && health.gemini
                ? (health.gemini.connected ? '✓ Connected' : '✗ ' + (health.gemini.error || 'Error'))
                : '—';
            settingGemini.style.color = (health && health.gemini && health.gemini.connected) ? '#4ADE80' : '#EF4444';
        }
        if (settingHindsight) {
            settingHindsight.textContent = health && health.hindsight
                ? (health.hindsight.connected ? '✓ Connected' : '✗ ' + (health.hindsight.error || 'Error'))
                : '—';
            settingHindsight.style.color = (health && health.hindsight && health.hindsight.connected) ? '#4ADE80' : '#EF4444';
        }
        if (settingBankId && health && health.hindsight) {
            settingBankId.textContent = health.hindsight.bankId || '—';
        }
        if (settingModel && health && health.gemini) {
            settingModel.textContent = health.gemini.model || '—';
        }

        // System message in conversation
        if (isHealthy) {
            addMessageToHistory('agent', 'System',
                `Connected — Gemini (${health.gemini.model}) · Hindsight bank "${health.hindsight.bankId}" ready.`);
            addMemoryActivity('store', `Hindsight bank "${health.hindsight.bankId}" connected.`);
        } else {
            addMessageToHistory('agent', 'System', `Status: ${health ? health.status : 'Unable to connect'}`);
        }

        return health;
    }

    window._ariaCheckHealth = runHealthCheck;
    if (btnHealthCheck) btnHealthCheck.addEventListener('click', runHealthCheck);

    // ══════════════════════════════════════════════════════════
    // RESET
    // ══════════════════════════════════════════════════════════
    async function doReset(btn) {
        const origText = btn.textContent;
        btn.disabled   = true;
        btn.textContent = 'Resetting...';

        try {
            await agent.clearMemory();

            // Clear state
            totalRecalled  = 0;
            totalStored    = 0;
            totalIncidents = 0;
            incidentLog.length = 0;
            retainedLog.length = 0;
            recalledLog.length = 0;

            // Clear DOM
            metricRecalled.textContent = '0';
            metricStored.textContent   = '0';
            kpiIncidents.textContent   = '0';
            kpiRecalled.textContent    = '0';
            kpiStored.textContent      = '0';
            incidentCount.textContent  = '0';
            memoryCount.textContent    = '0';
            retainedCount.textContent  = '0';
            recalledCount.textContent  = '0';
            if (settingsSessionCount)  settingsSessionCount.textContent  = '0';
            if (settingsRetainedCount) settingsRetainedCount.textContent = '0';

            conversationHistory.innerHTML = '';
            memoryLog.innerHTML           = '';
            inputArea.value               = '';
            clearAnalysis();

            // Reset incident table
            incidentTbody.innerHTML = '';
            incidentTable.style.display = 'none';
            incidentsEmpty.style.display = '';

            // Reset memory bank
            retainedList.innerHTML = '<div class="feed-empty">No records retained yet.</div>';
            recalledList.innerHTML = '<div class="feed-empty">No memories recalled yet.</div>';

            // Reset overview
            overviewLastAnalysis.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" width="32" height="32" style="opacity:0.2;margin-bottom:0.75rem"><path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="currentColor" stroke-width="1.2"/></svg><p>No incidents analyzed yet.</p>';
            overviewMemoryFeed.innerHTML = '<div class="feed-empty">Memory activity will appear here.</div>';

            addMessageToHistory('agent', 'System', 'Environment and Hindsight memory bank reset.');
            addMemoryActivity('recall', 'Memory bank cleared.');
        } finally {
            btn.disabled    = false;
            btn.textContent = origText;
        }
    }

    btnReset && btnReset.addEventListener('click', () => doReset(btnReset));
    btnResetSettings && btnResetSettings.addEventListener('click', () => doReset(btnResetSettings));

    // ══════════════════════════════════════════════════════════
    // ANALYZE
    // ══════════════════════════════════════════════════════════
    btnAnalyze && btnAnalyze.addEventListener('click', async () => {
        const text = inputArea.value.trim();
        if (!text) return;

        addMessageToHistory('user', 'Analyst', text);
        inputArea.value = '';

        // Switch to agent view if not already on it
        const currentActive = document.querySelector('.view.active');
        if (!currentActive || currentActive.id !== 'view-agent') {
            switchView('agent');
        }

        btnAnalyze.disabled     = true;
        btnAnalyze.textContent  = 'Querying Hindsight & Gemini...';
        btnAnalyze.classList.add('loading');
        confidenceBadge.textContent  = 'ANALYZING';
        confidenceBadge.className    = 'confidence-badge neutral loading';

        try {
            const result = await agent.analyzeIncident(text);
            renderAnalysis(result);

            // Increment incident counter
            totalIncidents++;
            const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            incidentCount.textContent = totalIncidents;

            // Memory tracking
            let recalledCount_ = 0;
            let wasRetained    = false;

            if (result.recalledMemories && result.recalledMemories.length > 0) {
                totalRecalled += result.recalledMemories.length;
                recalledCount_ = result.recalledMemories.length;
                metricRecalled.textContent = totalRecalled;
                kpiRecalled.textContent    = totalRecalled;

                result.recalledMemories.forEach(mem => {
                    addMemoryActivity('recall', `[RECALL] ${mem.text}`);
                    addToRecalledList(mem.text, ts);
                    recalledLog.push({ time: ts, text: mem.text });
                });
            } else {
                addMemoryActivity('recall', '[RECALL] No matching memories found in bank.');
            }

            if (result.retainLog) {
                totalStored++;
                wasRetained = true;
                metricStored.textContent = totalStored;
                kpiStored.textContent    = totalStored;
                memoryCount.textContent  = totalStored;
                retainedCount.textContent = totalStored;
                if (settingsRetainedCount) settingsRetainedCount.textContent = totalStored;
                addMemoryActivity('store', `[RETAIN] ${result.retainLog}`);
                addToRetainedList(result.retainLog, ts);
                retainedLog.push({ time: ts, text: result.retainLog });
            } else if (result.memoryEvaluation && result.memoryEvaluation.decision === 'SKIP') {
                addMemoryActivity('recall', '[EVAL] Skipped — insufficient long-term significance.');
            }

            // Incident log
            const confLevel = (result.analysis.confidenceLevel || 'medium').toLowerCase();
            const shortSummary = result.analysis.summary
                ? result.analysis.summary.substring(0, 120) + (result.analysis.summary.length > 120 ? '...' : '')
                : text.substring(0, 120);

            incidentLog.push({ time: ts, summary: shortSummary, confidence: confLevel, recalled: recalledCount_, retained: wasRetained ? 1 : 0 });
            appendIncidentRow(totalIncidents, ts, shortSummary, confLevel, recalledCount_, wasRetained);

            // Update overview
            kpiIncidents.textContent = totalIncidents;
            if (settingsSessionCount) settingsSessionCount.textContent = totalIncidents;
            updateOverviewLastAnalysis(result, text);

            addMessageToHistory('agent', 'ARIA',
                `Analysis complete using ${result.model || 'Gemini'}. ${totalRecalled} memories recalled · ${totalStored} retained.`);
        } finally {
            btnAnalyze.disabled    = false;
            btnAnalyze.textContent = 'Analyze Incident';
            btnAnalyze.classList.remove('loading');
        }
    });

    // ══════════════════════════════════════════════════════════
    // RENDER ANALYSIS
    // ══════════════════════════════════════════════════════════
    function renderAnalysis(result) {
        const { analysis, entities, recalledMemories } = result;

        // Show sections, hide empty state
        if (analysisEmpty)   analysisEmpty.style.display  = 'none';
        if (analysisSections) analysisSections.style.display = '';

        outSummary.textContent    = analysis.summary    || 'No summary provided.';
        outAssessment.textContent = analysis.assessment || 'No assessment provided.';
        outInvestigation.textContent = analysis.recommendedInvestigation || 'None';
        outResponse.textContent      = analysis.recommendedResponse      || 'None';
        outMissing.textContent       = analysis.missing || 'None';

        // Evidence + entities
        let evidenceText = analysis.evidence || '';
        if (entities && entities.length > 0) {
            evidenceText += '\n\nObserved Entities: ' + entities.join(', ');
        }
        outEvidence.textContent = evidenceText || 'No explicit evidence extracted.';

        // Historical context
        let histText = analysis.historicalContext || '';
        if (recalledMemories && recalledMemories.length > 0) {
            histText += '\n\nRecalled Memories from Hindsight:';
            recalledMemories.forEach((m, i) => {
                histText += `\n- [Memory ${i + 1}] ${m.text}`;
            });
        }
        outHistorical.textContent = histText.trim() || 'No relevant historical context retrieved.';

        // Confidence badge
        const level = ((analysis.confidenceLevel || analysis.confidence || 'medium') + '').toLowerCase();
        let cls = 'medium';
        if (level.includes('high')) cls = 'high';
        else if (level.includes('low')) cls = 'low';

        confidenceBadge.textContent = cls.toUpperCase();
        confidenceBadge.className   = `confidence-badge ${cls}`;
    }

    function clearAnalysis() {
        if (analysisEmpty)    analysisEmpty.style.display    = '';
        if (analysisSections) analysisSections.style.display = 'none';
        confidenceBadge.textContent = 'Waiting';
        confidenceBadge.className   = 'confidence-badge neutral';
    }

    // ══════════════════════════════════════════════════════════
    // MESSAGE HISTORY
    // ══════════════════════════════════════════════════════════
    function addMessageToHistory(role, name, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        msgDiv.innerHTML = `
            <div class="message-header">${name}</div>
            <div class="message-body">${escapeHtml(text)}</div>
        `;
        conversationHistory.appendChild(msgDiv);
        conversationHistory.scrollTop = conversationHistory.scrollHeight;
    }

    // ══════════════════════════════════════════════════════════
    // MEMORY ACTIVITY
    // ══════════════════════════════════════════════════════════
    function addMemoryActivity(type, text) {
        const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // Memory log (Agent view)
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.innerHTML = `<span class="timestamp">[${ts}]</span><span class="log-text">${escapeHtml(text)}</span>`;
        memoryLog.prepend(logEntry);

        // Overview memory feed
        const feedEntry = document.createElement('div');
        feedEntry.className = 'feed-entry';
        feedEntry.innerHTML = `
            <span class="feed-entry-dot ${type}"></span>
            <span class="feed-entry-text">${escapeHtml(text)}</span>
            <span class="feed-entry-time">${ts}</span>
        `;

        const emptyEl = overviewMemoryFeed.querySelector('.feed-empty');
        if (emptyEl) emptyEl.remove();
        overviewMemoryFeed.prepend(feedEntry);

        // Keep overview feed capped
        const entries = overviewMemoryFeed.querySelectorAll('.feed-entry');
        if (entries.length > 12) entries[entries.length - 1].remove();
    }

    // ══════════════════════════════════════════════════════════
    // INCIDENT TABLE
    // ══════════════════════════════════════════════════════════
    function appendIncidentRow(num, time, summary, conf, recalled, retained) {
        incidentsEmpty.style.display = 'none';
        incidentTable.style.display  = '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${num}</td>
            <td>${time}</td>
            <td>${escapeHtml(summary)}</td>
            <td><span class="conf-pill ${conf}">${conf.toUpperCase()}</span></td>
            <td>${recalled > 0 ? `<span style="color:#F59E0B">${recalled}</span>` : '<span style="color:var(--text-muted)">0</span>'}</td>
            <td>${retained ? '<span style="color:#60A5FA">✓</span>' : '<span style="color:var(--text-muted)">—</span>'}</td>
        `;
        incidentTbody.prepend(tr);
    }

    // ══════════════════════════════════════════════════════════
    // MEMORY BANK VIEW
    // ══════════════════════════════════════════════════════════
    function addToRetainedList(text, time) {
        const emptyEl = retainedList.querySelector('.feed-empty');
        if (emptyEl) emptyEl.remove();

        const div = document.createElement('div');
        div.className = 'memory-record retain';
        div.innerHTML = `<div>${escapeHtml(text)}</div><div class="memory-record-meta">${time}</div>`;
        retainedList.prepend(div);
    }

    function addToRecalledList(text, time) {
        const emptyEl = recalledList.querySelector('.feed-empty');
        if (emptyEl) emptyEl.remove();

        const div = document.createElement('div');
        div.className = 'memory-record recall';
        div.innerHTML = `<div>${escapeHtml(text)}</div><div class="memory-record-meta">${time}</div>`;
        recalledList.prepend(div);

        recalledCount.textContent = recalledList.querySelectorAll('.memory-record').length;
    }

    // ══════════════════════════════════════════════════════════
    // OVERVIEW LAST ANALYSIS
    // ══════════════════════════════════════════════════════════
    function updateOverviewLastAnalysis(result, originalText) {
        const conf  = (result.analysis.confidenceLevel || 'medium').toLowerCase();
        const conf_ = conf.includes('high') ? 'high' : conf.includes('low') ? 'low' : 'medium';
        const summary = result.analysis.summary || originalText.substring(0, 120);

        overviewLastAnalysis.innerHTML = `
            <div style="padding:1rem;display:flex;flex-direction:column;gap:0.6rem">
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <span class="conf-pill ${conf_}">${conf_.toUpperCase()}</span>
                    <span style="font-size:0.72rem;color:var(--text-muted)">Latest Analysis</span>
                </div>
                <div style="font-size:0.85rem;color:var(--text-primary);line-height:1.5">${escapeHtml(summary)}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary)">${result.analysis.assessment ? escapeHtml(result.analysis.assessment.substring(0, 200)) + '...' : ''}</div>
            </div>
        `;
    }

    // ══════════════════════════════════════════════════════════
    // UTILS
    // ══════════════════════════════════════════════════════════
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ══════════════════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════════════════
    clearAnalysis();
    await runHealthCheck();
});
