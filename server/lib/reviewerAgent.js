/**
 * Reviewer Agent helper functions
 * Handles communication with the Reviewer Agent in Kibana Agent Builder
 * 
 * The Reviewer Agent synthesizes the 4 listening agent reactions and
 * calculates divergence, risk level, and provides recommendations.
 */

const KIBANA_URL = process.env.KIBANA_URL;
const KIBANA_API_KEY = process.env.KIBANA_API_KEY;
const REVIEWER_AGENT_ID = process.env.REVIEWER_AGENT_ID || 'how-it-lands-reviewer';

/**
 * Reviewer Agent System Prompt (for reference when creating in Agent Builder)
 * 
 * You are a comedy editor analyzing audience reactions to a joke.
 * 
 * ## Input
 * You receive:
 * - line_text: The original joke
 * - reactions: Array of 4 listening agent perspectives (literal, inferred, ambiguity_spotter, contrarian)
 * 
 * ## Your Task
 * 1. Analyze divergence: How much do the 4 perspectives disagree?
 * 2. Identify the primary conflict (which two disagree most)
 * 3. Assess risk level for live performance
 * 4. Provide a specific, actionable recommendation
 * 
 * ## Output
 * Respond ONLY with this JSON:
 * {
 *   "divergence_score": 0-100,
 *   "risk_level": "low" | "medium" | "high",
 *   "primary_conflict": "e.g., literal vs inferred",
 *   "conflict_summary": "1 sentence explaining the core tension",
 *   "recommendation": "1-2 sentences of specific advice"
 * }
 * 
 * No markdown. No explanation.
 */

/**
 * Validates Reviewer Agent environment variables
 */
export function validateReviewerConfig() {
    if (!KIBANA_URL) {
        console.warn('[Reviewer] KIBANA_URL not set - reviewer agent will be unavailable');
        return false;
    }
    if (!KIBANA_API_KEY) {
        console.warn('[Reviewer] KIBANA_API_KEY not set - reviewer agent will be unavailable');
        return false;
    }
    return true;
}

/**
 * Call the Reviewer Agent to analyze Stage 1 reactions
 * @param {Object} params
 * @param {string} params.set_id - Set identifier
 * @param {string} params.line_text - The original joke text
 * @param {Array} params.stage1 - Array of Stage 1 reactions
 * @returns {Promise<Object>} - Reviewer response
 */
export async function callReviewerAgent({ set_id, line_text, stage1 }) {
    const url = `https://${KIBANA_URL}/api/agent_builder/converse`;

    // Format reactions for the agent
    const reactionsText = stage1.map(r =>
        `${r.agent_mode.toUpperCase()}:\n` +
        `  Feedback: ${r.feedback_text}\n` +
        `  Relatability: ${r.relatability}, Laugh Potential: ${r.laugh_potential}, Crowd Energy: ${r.crowd_energy}\n` +
        `  Reason Codes: ${(r.reason_codes || []).join(', ')}`
    ).join('\n\n');

    const input = `set_id=${set_id}
line_text=${line_text}

REACTIONS:
${reactionsText}

Analyze these 4 reactions and provide your assessment.`;

    const body = {
        agent_id: REVIEWER_AGENT_ID,
        input
    };

    console.log(`[Reviewer] Calling Reviewer Agent at ${url}`);
    console.log(`[Reviewer] Agent ID: ${REVIEWER_AGENT_ID}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `ApiKey ${KIBANA_API_KEY}`,
            'kbn-xsrf': 'true',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Reviewer] Error response: ${response.status}`, errorText);
        throw new Error(`Reviewer Agent error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Reviewer] Response received successfully`);

    return data;
}

/**
 * Normalize conflict string to ensure consistency
 * e.g. "Literal vs. The Fan" -> "literal vs the fan"
 * e.g. "The Fan vs. Literal" -> "literal vs the fan"
 */
function normalizeConflict(conflict) {
    if (!conflict || typeof conflict !== 'string') return null;

    // Lowercase and remove punctuation like periods
    let normalized = conflict.toLowerCase().replace(/\./g, '');

    // Split by 'vs' (handling vs, vs., v., etc if needed, but mainly vs)
    if (normalized.includes(' vs ')) {
        const parts = normalized.split(' vs ').map(p => p.trim());
        parts.sort(); // Alphabetical sort ensures "a vs b" is same as "b vs a"
        return parts.join(' vs ');
    }

    return normalized;
}

/**
 * Parse the Reviewer Agent response into structured data
 * @param {Object} agentResponse - Raw response from Agent Builder
 * @returns {Object} - Parsed reviewer assessment
 */
export function parseReviewerResponse(agentResponse) {
    console.log('[Reviewer] Raw Agent Response Structure:', Object.keys(agentResponse));
    console.log('[Reviewer] Raw Agent Response Payload:', JSON.stringify(agentResponse, null, 2));

    let result = {
        reasoning: 'Analysis pending...',
        divergence_score: 0,
        risk_level: 'unknown',
        primary_conflict: 'None detected',
        conflict_summary: 'Insufficient data for analysis',
        recommendation: 'No recommendation available'
    };

    try {
        // Agent Builder response has steps array, look for tool_call with params.data
        if (agentResponse.steps && Array.isArray(agentResponse.steps)) {
            for (const step of agentResponse.steps) {
                if (step.type === 'tool_call' && step.params?.data) {
                    const data = step.params.data;
                    if (data.divergence_score !== undefined) {
                        result = { ...result, ...data };
                    }
                }
            }
        }

        // Fallback: try other response formats
        if (result.risk_level === 'unknown') {
            // Agent Builder sometimes wraps output in a 'response' object
            let jsonContent = agentResponse.output ||
                agentResponse.message ||
                agentResponse.response?.message ||
                (typeof agentResponse === 'string' ? agentResponse : JSON.stringify(agentResponse));

            if (typeof jsonContent === 'string') {
                // Aggressively strip markdown code blocks
                jsonContent = jsonContent
                    .replace(/^```json\s*/, '')
                    .replace(/^```\s*/, '')
                    .replace(/\s*```$/, '')
                    .trim();

                try {
                    const parsed = JSON.parse(jsonContent);
                    result = { ...result, ...parsed };
                } catch (e) {
                    console.warn('[Reviewer] JSON parse failed, trying regex extraction');
                    // Try to find JSON object with regex if standard parse fails
                    const match = jsonContent.match(/\{[\s\S]*\}/);
                    if (match) {
                        try {
                            const parsed = JSON.parse(match[0]);
                            result = { ...result, ...parsed };
                        } catch (e2) {
                            console.error('[Reviewer] Regex JSON parse failed');
                        }
                    }
                }
            } else if (typeof jsonContent === 'object' && jsonContent.divergence_score !== undefined) {
                result = { ...result, ...jsonContent };
            }
        }

        // Normalize the primary conflict string
        if (result.primary_conflict) {
            result.primary_conflict = normalizeConflict(result.primary_conflict) || result.primary_conflict;
        }

        console.log(`[Reviewer] Parsed response: divergence=${result.divergence_score}, risk=${result.risk_level}, conflict=${result.primary_conflict}`);
    } catch (parseError) {
        console.error('[Reviewer] Failed to parse response:', parseError.message);
        console.error('[Reviewer] Raw response:', JSON.stringify(agentResponse).substring(0, 500));
    }

    return result;
}

/**
 * Get review for Stage 1 reactions (convenience function)
 * Combines calling the agent and parsing the response
 * @param {Object} params
 * @param {string} params.set_id - Set identifier
 * @param {string} params.line_text - The original joke text
 * @param {Array} params.stage1 - Array of Stage 1 reactions
 * @returns {Promise<Object>} - Parsed reviewer assessment
 */
export async function getReview({ set_id, line_text, stage1 }) {
    // Validate we have enough data to review
    if (!stage1 || stage1.length < 2) {
        console.log('[Reviewer] Insufficient Stage 1 data for review');
        return {
            divergence_score: 0,
            risk_level: 'low',
            primary_conflict: 'N/A',
            conflict_summary: 'Insufficient data for analysis',
            recommendation: 'Need more reactions to provide meaningful review'
        };
    }

    const response = await callReviewerAgent({ set_id, line_text, stage1 });
    return parseReviewerResponse(response);
}
