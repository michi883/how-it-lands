/**
 * Agent Builder helper functions
 * Handles communication with Kibana Agent Builder API
 */

const KIBANA_URL = process.env.KIBANA_URL;
const KIBANA_API_KEY = process.env.KIBANA_API_KEY;
const AGENT_ID = process.env.AGENT_ID || 'how-it-lands-agent';

/**
 * Validates Agent Builder environment variables
 */
export function validateAgentConfig() {
    if (!KIBANA_URL) {
        throw new Error('Missing required environment variable: KIBANA_URL');
    }
    if (!KIBANA_API_KEY) {
        throw new Error('Missing required environment variable: KIBANA_API_KEY');
    }
}

/**
 * Call the Agent Builder converse API
 * @param {Object} params
 * @param {string} params.set_id - Unique set identifier
 * @param {string} params.line_id - Line identifier within the set
 * @param {string} params.line_text - The standup line to analyze
 * @returns {Promise<Object>} - Agent response
 */
export async function callAgentBuilderConverse({ set_id, line_id, line_text }) {
    const url = `https://${KIBANA_URL}/api/agent_builder/converse`;

    // Format input as the agent expects
    const input = `set_id=${set_id}
line_id=${line_id}
line_text=${line_text}`;

    const body = {
        agent_id: AGENT_ID,
        input
    };

    console.log(`[Agent] Calling Agent Builder at ${url}`);
    console.log(`[Agent] Agent ID: ${AGENT_ID}`);
    console.log(`[Agent] Input:\n${input}`);

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
        console.error(`[Agent] Error response: ${response.status}`, errorText);
        throw new Error(`Agent Builder error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Agent] Response received successfully`);
    console.log(`[Agent] Full response:`, JSON.stringify(data, null, 2).substring(0, 2000));

    return data;
}
