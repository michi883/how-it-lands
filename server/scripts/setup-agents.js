#!/usr/bin/env node
/**
 * Setup Script: Provision Agents in Kibana Agent Builder
 * 
 * This script creates the required agents in Kibana Agent Builder:
 * - how-it-lands-agent: Main listening agent (6 perspectives)
 * - how-it-lands-reviewer: Reviewer agent (Stage 3)
 * 
 * Usage: node scripts/setup-agents.js
 */

import 'dotenv/config';

const KIBANA_URL = process.env.KIBANA_URL;
const KIBANA_API_KEY = process.env.KIBANA_API_KEY;

// Agent definitions
const AGENTS = [
    {
        id: 'how-it-lands-agent',
        name: 'How It Lands Agent',
        description: 'Simulates audience reactions to comedy from 6 perspectives',
        prompt: `You simulate how a comedy club audience might react to jokes. You speak as an audience member reacting to a comic.

## Input
You receive: set_id, line_id, line_text (the joke or bit)

## Stage 1: Audience Reactions (6 perspectives)
React to the joke from these 6 perspectives:
1. **literal** - React to exactly what was said
2. **inferred** - React to what you think they meant
3. **ambiguity_spotter** - Point out confusing parts
4. **the_skeptic** - Doubts the premise, finds holes in logic
5. **the_fan** - Optimistic, charitable interpretation, supportive energy
6. **the_surrealist** - Focuses on the absurd, abstract, or weird elements

For each reaction:
- feedback_id: f1, f2, f3, f4, f5, f6
- agent_mode: the mode name
- feedback_text: 1-2 sentences in audience voice
- reason_codes: 1-3 short tags
- relatability: low, medium, or high
- laugh_potential: low, medium, or high
- crowd_energy: cold, warm, or hot

## Stage 2: Specific Angles to Explore
For EACH Stage 1 reaction, identify the core TOPIC from that reaction. Then generate 3 SPECIFIC ANGLES the comic could explore about that topic.

For each angle:
- angle_id: a1, a2, a3, etc (3 per reaction = 18 total)
- parent_feedback_id: f1, f2, f3, f4, f5, or f6
- angle_name: 2-4 word name
- direction: specific exploration with examples (1-2 sentences)

## Output
Respond ONLY with this JSON:
{"stage1":[...],"stage2":[...]}

No markdown. No explanation. Be VERY SPECIFIC in Stage 2 directions.`
    },
    {
        id: 'how-it-lands-reviewer',
        name: 'How It Lands Reviewer',
        description: 'Synthesizes audience reactions and provides divergence analysis',
        prompt: `You are a comedy editor analyzing audience reactions to a joke.

## Input
You receive:
- line_text: The original joke
- reactions: Array of 6 listening agent perspectives (literal, inferred, ambiguity_spotter, the_skeptic, the_fan, the_surrealist)

## Your Task
1. Provide a brief analysis of the reactions.
2. Analyze divergence: How much do the 6 perspectives disagree?
3. Identify the primary conflict (which two disagree most)
4. Assess risk level for live performance
5. Provide a specific, actionable recommendation

## Scoring Guidelines
- divergence_score 0-30: Perspectives mostly agree, low risk
- divergence_score 31-60: Some disagreement, moderate risk
- divergence_score 61-100: Strong disagreement, high risk of misunderstanding

## Output
Respond ONLY with this JSON:
{
  "reasoning": "Brief analysis of the reactions",
  "divergence_score": 0-100,
  "risk_level": "low" | "medium" | "high",
  "primary_conflict": "e.g., literal vs inferred",
  "conflict_summary": "1 sentence explaining the core tension",
  "recommendation": "1-2 sentences of specific advice"
}

No markdown. No code blocks. Just the raw JSON string.`
    }
];

/**
 * Make authenticated request to Kibana API
 */
async function kibanaRequest(method, path, body = null) {
    const url = `https://${KIBANA_URL}${path}`;
    const options = {
        method,
        headers: {
            'Authorization': `ApiKey ${KIBANA_API_KEY}`,
            'kbn-xsrf': 'true',
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const text = await response.text();

    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (e) {
        data = { raw: text };
    }

    return { status: response.status, ok: response.ok, data };
}

/**
 * Check if an agent exists
 */
async function agentExists(agentId) {
    const { status } = await kibanaRequest('GET', `/api/agent_builder/agents/${agentId}`);
    return status === 200;
}

/**
 * Create or update an agent
 */
async function upsertAgent(agent) {
    console.log(`\n[Setup] Checking agent: ${agent.id}`);

    const exists = await agentExists(agent.id);

    // Agent Builder API uses nested configuration object
    const agentPayload = {
        name: agent.name,
        description: agent.description,
        configuration: {
            instructions: agent.prompt,
            tools: []  // Empty tools array - using LLM only
        }
    };

    if (exists) {
        console.log(`[Setup] Agent exists, updating...`);
        const { ok, data } = await kibanaRequest('PUT', `/api/agent_builder/agents/${agent.id}`, agentPayload);
        if (ok) {
            console.log(`[Setup] ✓ Updated: ${agent.name}`);
        } else {
            console.error(`[Setup] ✗ Update failed:`, data);
            return false;
        }
    } else {
        console.log(`[Setup] Agent does not exist, creating...`);
        const createPayload = { ...agentPayload, id: agent.id };
        const { ok, data } = await kibanaRequest('POST', '/api/agent_builder/agents', createPayload);
        if (ok) {
            console.log(`[Setup] ✓ Created: ${agent.name}`);
        } else {
            console.error(`[Setup] ✗ Create failed:`, data);
            return false;
        }
    }

    return true;
}

/**
 * Main setup function
 */
async function main() {
    console.log('='.repeat(50));
    console.log('How It Lands - Agent Setup');
    console.log('='.repeat(50));

    // Validate configuration
    if (!KIBANA_URL || !KIBANA_API_KEY) {
        console.error('\n[Setup] Error: Missing KIBANA_URL or KIBANA_API_KEY in .env');
        process.exit(1);
    }

    console.log(`\n[Setup] Kibana URL: ${KIBANA_URL}`);

    // Test connection
    console.log('\n[Setup] Testing Kibana connection...');
    const { ok, status } = await kibanaRequest('GET', '/api/status');
    if (!ok && status !== 200) {
        console.error(`[Setup] ✗ Cannot connect to Kibana (status: ${status})`);
        process.exit(1);
    }
    console.log('[Setup] ✓ Connected to Kibana');

    // Create/update agents
    let success = true;
    for (const agent of AGENTS) {
        const result = await upsertAgent(agent);
        if (!result) success = false;
    }

    console.log('\n' + '='.repeat(50));
    if (success) {
        console.log('[Setup] ✓ All agents provisioned successfully!');
        console.log('\nNext steps:');
        console.log('1. Add REVIEWER_AGENT_ID=how-it-lands-reviewer to .env');
        console.log('2. Run: npm run dev');
    } else {
        console.log('[Setup] ✗ Some agents failed to provision');
        process.exit(1);
    }
    console.log('='.repeat(50));
}

main().catch(err => {
    console.error('\n[Setup] Fatal error:', err.message);
    process.exit(1);
});
