# How It Lands

A demo application for analyzing comedy material using **React + Node.js + Elasticsearch Agent Builder**. See how your jokes might land with different audience perspectives, powered by GenAI agents.

![Demo Screenshot](/assets/screenshot.png) *(Optional: Add a screenshot here)*

## 🚀 Features

- **🎭 Audience Reactions** - Get 4 distinct perspectives on your joke (Literal, Inferred, Ambiguity Spotter, Contrarian).
- **📊 Audience Metrics** - Each reaction provides Relatability, Laugh Potential, and Crowd Energy scores.
- **🎯 Reviewer Agent** - Synthesizes reactions, calculates divergence scores, and provides actionable recommendations.
- **🔍 Similar Jokes** - Finds semantically similar jokes from history using ELSER embeddings.
- **📈 Insights Dashboard** - Visualizes risk distribution, energy trends, and common conflicts using ES|QL.
- **Specific Angles** - Generates 3 detailed exploration directions for each reaction (12 total).
- **History** - View, reload, and delete past joke analyses.

---

## 🛠️ Tech Stack

- **Frontend**: React (Vite)
- **Backend**: Node.js (Express)
- **Database / AI**: Elasticsearch (Agent Builder, ELSER, ES|QL)

---

## 🏁 Quick Start

### Prerequisites

- Node.js 18+
- Elastic Cloud account with:
  - Elasticsearch cluster
  - Kibana with Agent Builder enabled

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Configure Environment

Create a `.env` file in the `server` directory:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your Elastic Cloud credentials:

```env
# Elasticsearch
ES_URL=https://your-es-host.elastic-cloud.com:443
ES_API_KEY=your_elasticsearch_api_key

# Kibana Agent Builder
KIBANA_URL=your-kibana-host.elastic-cloud.com
KIBANA_API_KEY=your_kibana_api_key

# Agent Configuration
AGENT_ID=how-it-lands-agent
REVIEWER_AGENT_ID=how-it-lands-reviewer

# Server
PORT=3001
```

### 3. Provision Agents

Use the setup script to automatically create and configure the agents in Kibana Agent Builder:

```bash
cd server
node scripts/setup-agents.js
```

This will create or update:
1. `How It Lands Agent` (Main listening agent - Stage 1 & 2)
2. `How It Lands Reviewer` (Reviewer agent - Stage 3)

### 4. Run the Application

From the root directory:

```bash
npm run dev
```

- **Backend**: http://localhost:3001
- **Frontend**: http://localhost:5173

---

## 📂 Project Structure

```
how-it-lands/
├── server/
│   ├── index.js              # Express API server
│   ├── scripts/
│   │   └── setup-agents.js   # Agent provisioning script
│   └── lib/
│       ├── elasticsearch.js  # ES client & queries (ELSER, ES|QL)
│       ├── agentBuilder.js   # Agent Builder API integration
│       ├── reviewerAgent.js  # Reviewer Agent logic
│       └── analytics.js      # Analytics queries
└── web/
    └── src/
        ├── App.jsx           # Main application
        └── components/
            ├── Stage1Card.jsx    # Reaction cards
            ├── Stage2List.jsx    # Angle list
            ├── ReviewerCard.jsx  # Stage 3 Reviewer
            ├── SimilarJokes.jsx  # Semantic search results
            ├── InsightsPanel.jsx # Analytics dashboard
            └── HistoryList.jsx   # History view
```

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | POST | Analyze a joke. Returns reactions, angles, and review. |
| `/api/results` | GET | Fetch results by `set_id`. |
| `/api/history` | GET | Get paginated history list. |
| `/api/similar` | GET | Find semantically similar jokes (Stage 4). |
| `/api/insights` | GET | Get analytics data via ES|QL (Stage 5). |
| `/api/history/:set_id` | DELETE | Delete a joke and its data. |
| `/health` | GET | Health check. |

**Example Analysis Request:**

```bash
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{ "line_text": "My favorite party trick is not attending parties" }'
```

---

## 🔍 Elasticsearch Index

The app automatically manages the `how-it-lands` index with the following structure:

- **Stage 1 (Reactions):** `feedback_text`, `relatability`, `laugh_potential`, `crowd_energy`
- **Stage 2 (Angles):** `angle_name`, `direction`
- **Stage 3 (Review):** `divergence_score`, `risk_level`, `primary_conflict`, `recommendation`
- **Semantic Search:** Uses `semantic_text` field with the **ELSER** inference model for finding similar jokes.

---

## ❓ Troubleshooting

| Issue | Solution |
|-------|----------|
| **Agent returns empty response** | Check agent instructions format in Agent Builder. Verify Agent ID matches `.env`. |
| **ES bulk index error** | Verify `ES_API_KEY` has write permissions. |
| **Schema/Column errors** | Run `node server/scripts/reset-index.js` to clear and recreate the index. |
| **CORS errors** | Ensure the backend is running on port 3001 and the frontend is pointing to it. |

---

## 📄 License

MIT
