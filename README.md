# AIRA — AI Incident Response Agent

An automated, intelligent Incident Response Agent that correlates live security alerts with persistent long-term memory using **Google Gemini LLM** and **Hindsight Cloud**.

---

## 🌟 Key Features

- **Entity Extraction**: Automatically extracts IPv4 addresses, domains, file hashes, usernames, process names, hostnames, and malware signatures from incoming alerts.
- **Persistent Memory Layer (Hindsight)**: Uses Hindsight Cloud API to recall historical security intelligence and prevent noise contamination via relevance filtering.
- **Structured Context Assembly**: Strictly isolates **Current Evidence** from **Historical Context**, enforcing agent reasoning to treat historical memories as background rather than fabricated present events.
- **Automated Memory Update (AIRA Retain)**: An independent evaluation layer scores the security value of incident findings, scrubs sensitive credentials/API keys, and records structured intelligence for future investigations.
- **Operational Web Dashboard**: Real-time analyst console with interactive scenario testing, live memory metrics, and audit logs.

---

## 🏗️ Architecture Workflow

```text
Incident Input
      │
      ▼
[Entity Extractor]      ──► Identifies IPs, accounts, processes, hashes
      │
      ▼
[Hindsight Recall]       ──► Queries bank "incident-response-agent"
      │
      ▼
[Relevance Filter]       ──► Eliminates database noise and irrelevant records
      │
      ▼
[Context Assembler]      ──► Builds structured prompt separating Evidence vs History
      │
      ▼
[Gemini LLM Reasoning]   ──► Produces structured analysis & recommended actions
      │
      ▼
[Memory Evaluator]       ──► Scrubs secrets (passwords/API keys) & validates significance
      │
      ▼
[Hindsight Retain]       ──► Stores high-value security intelligence for future recall
```

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- Google Gemini API Key ([Google AI Studio](https://aistudio.google.com/))
- Hindsight API Key ([Hindsight Cloud / Vectorize](https://hindsight.vectorize.io))

### 2. Environment Setup

Copy `.env.example` to create your local `.env`:

```bash
cp .env.example .env
```

Configure your API keys in `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
HINDSIGHT_API_KEY=your_hindsight_api_key_here
HINDSIGHT_API_URL=https://api.hindsight.vectorize.io
HINDSIGHT_BANK_ID=incident-response-agent
PORT=8000
```

> **Note:** `.env` is ignored by Git and will never be committed to your repository.

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Application

Start the backend server:

```bash
npm start
```

Open your browser at:
```text
http://localhost:8000
```

---

## 🧪 Testing & Validation

Run the test suite commands:

- **Full End-to-End Validation (4-Conversation Suite)**:
  ```bash
  npm test
  # or
  npm run test:validation
  ```
- **Connection & Health Check**:
  ```bash
  npm run test:health
  ```
- **Context Assembly & Prompt Verification**:
  ```bash
  npm run test:context
  ```
- **Memory Evaluator & Redaction Tests**:
  ```bash
  npm run test:memory
  ```
- **Direct Hindsight Operations**:
  ```bash
  npm run test:hindsight
  ```

---

## 🛡️ Security Boundaries

- **Secret Scrubbing**: Automatic redaction of credentials, API keys, passwords, and tokens before any memory retention.
- **Zero Evidence Contamination**: Historical events cannot masquerade as observed incident evidence.
- **Recommendation Labeling**: System responses label mitigation steps as *analyst recommendations*, not executed actions.
