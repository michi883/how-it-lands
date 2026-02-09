/**
 * How It Lands - Backend Server
 * Express server for React + Elasticsearch Agent Builder demo
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

import { validateESConfig, ensureIndex, storeDocsToES, fetchDocsFromES, fetchHistory, deleteBySetId, findSimilarJokes } from './lib/elasticsearch.js';
import { validateAgentConfig, callAgentBuilderConverse } from './lib/agentBuilder.js';
import { validateReviewerConfig, getReview } from './lib/reviewerAgent.js';
import { getAllInsights } from './lib/analytics.js';

// Track if reviewer agent is available
let reviewerEnabled = false;

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /api/analyze
 * Analyze a standup line using the Agent Builder agent
 * 
 * Body: { line_text: string }
 * Returns: { set_id, line_id, stage1: [...], stage2: [...], stage3: {...} }
 */
/**
 * POST /api/analyze
 * Analyzes a joke line using Agent Builder agents.
 * Uses Server-Sent Events (SSE) to stream progress and results,
 * preventing timeouts on long-running requests.
 */
app.post('/api/analyze', async (req, res) => {
    const { line_text } = req.body;

    if (!line_text || typeof line_text !== 'string' || line_text.trim().length === 0) {
        return res.status(400).json({
            error: 'Invalid request',
            message: 'line_text is required and must be a non-empty string'
        });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Helper to send SSE events
    const sendEvent = (type, data) => {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Keep-alive interval to prevent timeout
    const keepAlive = setInterval(() => {
        sendEvent('ping', { timestamp: Date.now() });
    }, 15000); // Send heartbeat every 15s

    const set_id = uuidv4();
    const line_id = 'l1';

    try {
        console.log(`[Analyze] Starting analysis for set_id=${set_id}`);
        sendEvent('start', { set_id, line_id, message: 'Analysis started...' });

        // --- Stage 1: Parallel Perspectives ---
        sendEvent('progress', { message: 'Consulting the council of comedy (6 perspectives)...' });

        const perspectives = [
            'Literal',
            'Inferred',
            'Ambiguity Spotter',
            'The Skeptic',
            'The Fan',
            'The Surrealist'
        ];

        const stage1Results = [];
        const stage2Results = [];
        let completedCount = 0;

        // Helper to run a single perspective analysis
        const analyzePerspective = async (role) => {
            try {
                const roleId = role.toLowerCase().replace(/ /g, '_');
                console.log(`[Analyze] Starting perspective: ${role}`);

                // Specific prompt for this role
                const specificInput = `Act as the "${role}" audience persona.
Analyze this standup line: "${line_text.trim()}"

Return a SINGLE JSON object with this structure:
{
  "agent_mode": "${roleId}",
  "feedback_text": "Your reaction as ${role}...",
  "relatability": "High/Medium/Low",
  "laugh_potential": "High/Medium/Low",
  "crowd_energy": "Hot/Warm/Cold",
  "reason_codes": ["tag1", "tag2"],
  "concepts": [
    {
       "angle_name": "Name of the comedy angle spotted",
       "explanation": "Why this angle works from your perspective",
       "exploration_direction": "How to expand on this"
    }
  ]
}
`;
                const agentResponse = await callAgentBuilderConverse({
                    set_id: `${set_id}-${roleId}`, // Unique conversation ID per role to avoid context pollution
                    line_id,
                    line_text: specificInput
                });

                // Parse Result
                let result = null;

                const parseCandidate = (text) => {
                    try {
                        const clean = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
                        const parsed = JSON.parse(clean);
                        // Validate it has expected keys
                        if (parsed.feedback_text || parsed.relatability) return parsed;
                        return null;
                    } catch (e) {
                        try {
                            const match = text.match(/\{[\s\S]*\}/);
                            if (match) {
                                const parsed = JSON.parse(match[0]);
                                if (parsed.feedback_text || parsed.relatability) return parsed;
                            }
                        } catch (e2) { }
                        return null;
                    }
                };

                // Strategy 1: Top level fields
                if (agentResponse.output) result = parseCandidate(agentResponse.output);
                if (!result && agentResponse.message) result = parseCandidate(agentResponse.message);

                // Strategy 2: Nested response object
                if (!result && agentResponse.response?.message) result = parseCandidate(agentResponse.response.message);
                if (!result && agentResponse.response?.output) result = parseCandidate(agentResponse.response.output);

                // Strategy 3: Search in steps (if any)
                if (!result && agentResponse.steps && Array.isArray(agentResponse.steps)) {
                    for (const step of agentResponse.steps) {
                        // Check for tool output or message creation
                        if (step.type === 'message_creation' && step.content) {
                            result = parseCandidate(step.content);
                            if (result) break;
                        }
                    }
                }

                // Strategy 4: Fallback - treat entire response as string and regex search
                if (!result) {
                    const stringified = JSON.stringify(agentResponse);
                    result = parseCandidate(stringified);
                }

                // Final cleanup: if we somehow got a "wrapped" string, try parsing one more time
                if (result && typeof result === 'string') {
                    const reParsed = parseCandidate(result);
                    if (reParsed) result = reParsed;
                }

                if (result) {
                    // Ensure feedback_id
                    const feedbackId = `f_${roleId}_${Date.now()}`;
                    result.feedback_id = feedbackId;
                    result.agent_mode = roleId; // Enforce correct ID

                    stage1Results.push(result);

                    // Extract concepts to Stage 2
                    if (result.concepts && Array.isArray(result.concepts)) {
                        result.concepts.forEach((concept, idx) => {
                            stage2Results.push({
                                concept_id: `c_${feedbackId}_${idx}`,
                                parent_feedback_id: feedbackId,
                                set_id: set_id,
                                angle_name: concept.angle_name,
                                explanation: concept.explanation,
                                exploration_direction: concept.exploration_direction
                            });
                        });
                    }

                    completedCount++;

                    // Stream incremental update w/ Stage 2 data
                    sendEvent('result_stage1', { stage1: stage1Results, stage2: stage2Results });
                    sendEvent('progress', { message: `Received ${role} perspective (${completedCount}/6)...` });
                }

            } catch (err) {
                console.error(`[Analyze] Failed perspective ${role}:`, err.message);
                // We do not throw here, we just log and continue so other perspectives can finish
            }
        };

        // Launch all 6 in parallel
        await Promise.all(perspectives.map(p => analyzePerspective(p)));

        console.log(`[Analyze] Stage 1 complete. ${stage1Results.length} results.`);

        // Store Stage 1 Results
        await storeDocsToES({
            set_id,
            line_id,
            line_text: line_text.trim(),
            stage1: stage1Results,
            stage2: stage2Results,
            stage3: null
        });

        // --- Stage 3: Reviewer Agent ---
        if (reviewerEnabled && stage1Results.length > 0) {
            sendEvent('progress', { message: 'Synthesizing reviews...' });

            try {
                const stage3 = await getReview({ set_id, line_text: line_text.trim(), stage1: stage1Results });

                // Store Stage 3
                await storeDocsToES({
                    set_id,
                    line_id: 'l1',
                    line_text: line_text.trim(),
                    stage1: [], // Keep previous
                    stage2: [],
                    stage3
                });

                sendEvent('result_stage3', { stage3 });
            } catch (reviewError) {
                console.error('[Analyze] Reviewer error:', reviewError);
                sendEvent('error', { message: 'Review generation failed, but perspectives are available.' });
            }
        }

        sendEvent('done', { set_id });

    } catch (error) {
        console.error('[Analyze] Error:', error);
        sendEvent('error', { message: error.message || 'Analysis failed' });
    } finally {
        clearInterval(keepAlive);
        res.end();
    }
});

/**
 * GET /api/results
 * Fetch existing results for a set_id/line_id
 * 
 * Query: ?set_id=...&line_id=...
 * Returns: { set_id, line_id, stage1: [...], stage2: [...] }
 */
app.get('/api/results', async (req, res) => {
    try {
        const { set_id, line_id } = req.query;

        if (!set_id) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'set_id query parameter is required'
            });
        }

        const { stage1, stage2, stage3 } = await fetchDocsFromES({
            set_id,
            line_id: line_id || 'l1'
        });

        res.json({
            set_id,
            line_id: line_id || 'l1',
            stage1,
            stage2,
            stage3
        });

    } catch (error) {
        console.error('[Results] Error:', error.message);
        res.status(500).json({
            error: 'Failed to fetch results',
            message: error.message
        });
    }
});

/**
 * GET /api/history
 * Fetch history of past jokes
 * 
 * Query: ?limit=20&offset=0
 * Returns: { items: [...], total: number }
 */
app.get('/api/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        const { items, total } = await fetchHistory(limit, offset);

        res.json({
            items,
            total,
            limit,
            offset,
            hasMore: offset + items.length < total
        });

    } catch (error) {
        console.error('[History] Error:', error.message);
        res.status(500).json({
            error: 'Failed to fetch history',
            message: error.message
        });
    }
});

/**
 * DELETE /api/history/:set_id
 * Delete all documents for a joke
 * 
 * Returns: { deleted: number, message: string }
 */
app.delete('/api/history/:set_id', async (req, res) => {
    try {
        const { set_id } = req.params;

        if (!set_id) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'set_id is required'
            });
        }

        const { deleted } = await deleteBySetId(set_id);

        res.json({
            deleted,
            message: `Deleted ${deleted} documents`
        });

    } catch (error) {
        console.error('[Delete] Error:', error.message);
        res.status(500).json({
            error: 'Failed to delete',
            message: error.message
        });
    }
});

/**
 * GET /api/similar
 * Find jokes similar to the given text
 * 
 * Query: ?line_text=...&limit=5&exclude_set_id=...
 * Returns: { similar: [...] }
 */
app.get('/api/similar', async (req, res) => {
    try {
        const { line_text, limit, exclude_set_id } = req.query;

        if (!line_text) {
            return res.status(400).json({
                error: 'Missing required parameter',
                message: 'line_text is required'
            });
        }

        const maxLimit = Math.min(parseInt(limit) || 5, 10);
        const similarJokes = await findSimilarJokes(line_text, maxLimit, exclude_set_id || null);

        res.json({
            similar: similarJokes,
            count: similarJokes.length
        });

    } catch (error) {
        console.error('[Similar] Error:', error.message);
        res.status(500).json({
            error: 'Failed to find similar jokes',
            message: error.message
        });
    }
});

/**
 * GET /api/insights
 * Get analytics and trends via ES|QL
 */
app.get('/api/insights', async (req, res) => {
    try {
        const insights = await getAllInsights();
        res.json(insights);
    } catch (error) {
        console.error('[Insights] Error:', error.message);
        res.status(500).json({
            error: 'Failed to fetch insights',
            message: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Startup
async function start() {
    console.log('='.repeat(50));
    console.log('How It Lands - Backend Server');
    console.log('='.repeat(50));

    try {
        // Validate configuration
        console.log('[Startup] Validating configuration...');
        validateESConfig();
        validateAgentConfig();

        // Reviewer Agent is optional - validate but don't fail if not configured
        reviewerEnabled = validateReviewerConfig();
        if (reviewerEnabled) {
            console.log('[Startup] Reviewer Agent enabled');
        } else {
            console.log('[Startup] Reviewer Agent not configured (Stage 3 will be skipped)');
        }

        console.log('[Startup] Configuration valid');

        // Ensure ES index exists
        await ensureIndex();

        // Start server
        app.listen(PORT, () => {
            console.log(`[Startup] Server running on http://localhost:${PORT}`);
            console.log('='.repeat(50));
        });

    } catch (error) {
        console.error('[Startup] Failed to start server:', error.message);
        process.exit(1);
    }
}

start();
