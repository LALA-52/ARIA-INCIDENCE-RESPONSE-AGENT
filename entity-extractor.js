/**
 * Entity Extraction and Query Building for Incident Response Agent
 */

export function extractKeyEntities(text, recentContext = {}) {
    if (!text || typeof text !== 'string') return { entities: [], query: '', extracted: {} };

    const ips = new Set();
    const domains = new Set();
    const urls = new Set();
    const hashes = new Set();
    const usernames = new Set();
    const hostnames = new Set();
    const processes = new Set();
    const malware = new Set();
    const timestamps = new Set();

    // 1. IP Addresses (IPv4)
    const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    const ipMatches = text.match(ipv4Regex) || [];
    ipMatches.forEach(ip => ips.add(ip));

    // 2. URLs
    const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/gi;
    const urlMatches = text.match(urlRegex) || [];
    urlMatches.forEach(u => urls.add(u));

    // 3. Domains (excluding URLs already captured)
    const domainRegex = /\b[a-zA-Z0-9.-]+\.(?:com|org|net|io|edu|gov|xyz|biz|info|cloud)\b/gi;
    const domainMatches = text.match(domainRegex) || [];
    domainMatches.forEach(d => {
        if (![...urls].some(u => u.includes(d))) domains.add(d);
    });

    // 4. File Hashes (MD5: 32 hex, SHA1: 40 hex, SHA256: 64 hex)
    const hashRegex = /\b(?:[a-fA-F0-9]{64}|[a-fA-F0-9]{40}|[a-fA-F0-9]{32})\b/g;
    const hashMatches = text.match(hashRegex) || [];
    hashMatches.forEach(h => hashes.add(h));

    // 5. Usernames & Accounts
    const userPatterns = [
        /\b(?:admin|administrator|root|guest|service_account|secops|analyst)\b/gi,
        /\buser[_\s-]?\d+\b/gi,
        /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
        /\baccount\s+["']?([a-zA-Z0-9._-]+)["']?/gi
    ];
    userPatterns.forEach(regex => {
        const matches = text.match(regex) || [];
        matches.forEach(m => usernames.add(m.trim().toLowerCase()));
    });
    if (/administrative account/i.test(text)) {
        usernames.add('admin');
    }

    // 6. Hostnames / Workstations
    const hostRegex = /\b(?:ws|srv|dc|host|server|workstation)[-_]?[a-zA-Z0-9]+\b/gi;
    const hostMatches = text.match(hostRegex) || [];
    hostMatches.forEach(h => hostnames.add(h));

    // 7. Processes
    const processRegex = /\b[a-zA-Z0-9_-]+\.(?:exe|ps1|bat|sh|dll|bin|vbs)\b/gi;
    const processMatches = text.match(processRegex) || [];
    processMatches.forEach(p => processes.add(p.toLowerCase()));
    if (/powershell/i.test(text)) processes.add('powershell.exe');
    if (/cmd\.exe|command prompt/i.test(text)) processes.add('cmd.exe');

    // 8. Known Malware Families
    const malwareList = ['cobalt strike', 'mimikatz', 'emotet', 'qakbot', 'icedid', 'lockbit', 'wannacry', 'darkside', 'redline'];
    malwareList.forEach(m => {
        if (text.toLowerCase().includes(m)) malware.add(m);
    });

    // 9. Timestamps
    const timestampRegex = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?\b|\b\d{2}:\d{2}:\d{2}\b/g;
    const timeMatches = text.match(timestampRegex) || [];
    timeMatches.forEach(t => timestamps.add(t));

    // 10. Handle reference resolution like "the same IP" or "same host"
    let contextualReference = false;
    if (/(?:the\s+)?same\s+ip(?:\s+address)?/i.test(text) || /this\s+ip/i.test(text)) {
        contextualReference = true;
        if (recentContext.lastIp && !ips.has(recentContext.lastIp)) {
            ips.add(recentContext.lastIp);
        }
    }
    if (/(?:the\s+)?same\s+(?:account|user)/i.test(text) && recentContext.lastAccount) {
        usernames.add(recentContext.lastAccount);
    }

    const allEntities = [
        ...ips,
        ...domains,
        ...urls,
        ...hashes,
        ...usernames,
        ...hostnames,
        ...processes,
        ...malware,
        ...timestamps
    ];

    // Build focused Recall Query
    let queryParts = [];
    if (ips.size > 0) queryParts.push([...ips].join(' '));
    if (domains.size > 0) queryParts.push([...domains].join(' '));
    if (hashes.size > 0) queryParts.push([...hashes].join(' '));
    if (usernames.size > 0) queryParts.push([...usernames].join(' '));
    if (processes.size > 0) queryParts.push([...processes].join(' '));
    if (malware.size > 0) queryParts.push([...malware].join(' '));

    let recallQuery = queryParts.join(' ').trim();
    if (!recallQuery) {
        // Fallback: extract prominent keywords if no strict indicator was matched
        recallQuery = text.replace(/[^\w\s.-]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 8).join(' ');
    } else {
        recallQuery += " incident authentication threat";
    }

    return {
        entities: allEntities,
        recallQuery: recallQuery.trim(),
        contextualReference,
        categorized: {
            ips: [...ips],
            domains: [...domains],
            urls: [...urls],
            hashes: [...hashes],
            usernames: [...usernames],
            hostnames: [...hostnames],
            processes: [...processes],
            malware: [...malware],
            timestamps: [...timestamps]
        }
    };
}

/**
 * Filter memories from Hindsight Recall to avoid injecting irrelevant database noise
 */
export function filterRelevantMemories(results, currentIncidentText, extractedEntities) {
    if (!Array.isArray(results) || results.length === 0) return [];

    const lowerIncident = currentIncidentText.toLowerCase();
    const entityTokens = extractedEntities.map(e => e.toLowerCase());

    const filtered = results.filter(mem => {
        const memTextLower = (mem.text || '').toLowerCase();
        const memEntities = (mem.entities || []).map(e => e.toLowerCase());

        // 1. Direct Entity match
        const hasEntityOverlap = entityTokens.some(e => 
            memEntities.includes(e) || memTextLower.includes(e)
        );

        // 2. Score threshold check (reranker or final score)
        const score = mem.scores?.reranker ?? mem.scores?.final ?? mem.scores?.semantic ?? 0;
        const isHighConfidenceScore = score > 0.05 || (mem.scores?.semantic && mem.scores.semantic > 0.65);

        // If current text has an IP, ensure the memory matches that IP or account
        const extractedIps = entityTokens.filter(t => /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(t));
        if (extractedIps.length > 0) {
            const matchesCurrentIp = extractedIps.some(ip => memTextLower.includes(ip) || memEntities.includes(ip));
            // Only keep if it matches the current IP or is strongly correlated
            return matchesCurrentIp;
        }

        return hasEntityOverlap && isHighConfidenceScore;
    });

    // Limit to top 3 most relevant memories to prevent context bloat
    return filtered.slice(0, 3);
}
