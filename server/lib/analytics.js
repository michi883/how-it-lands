/**
 * Analytics module - ES|QL queries for trend analysis
 * Provides insights on joke patterns, risk distribution, and crowd energy trends
 */

const ES_URL = process.env.ES_URL;
const ES_API_KEY = process.env.ES_API_KEY;
const INDEX_NAME = 'how-it-lands';

/**
 * Execute an ES|QL query
 * @param {string} query - ES|QL query string
 * @returns {Promise<Object>} - Query results
 */
async function esqlQuery(query) {
    const url = `${ES_URL}/_query`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `ApiKey ${ES_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[ES|QL] Query error:', errorText);
        throw new Error(`ES|QL query failed: ${response.status}`);
    }

    return await response.json();
}

/**
 * Transform ES|QL response to array of objects
 */
function transformEsqlResponse(esqlResponse) {
    const { columns, values } = esqlResponse;
    if (!columns || !values) return [];

    return values.map(row => {
        const obj = {};
        columns.forEach((col, idx) => {
            obj[col.name] = row[idx];
        });
        return obj;
    });
}

/**
 * Get risk level distribution across all analyzed jokes
 */
export async function getRiskDistribution() {
    console.log('[Analytics] Fetching risk distribution...');

    const query = `
        FROM ${INDEX_NAME}
        | WHERE stage == 3 AND risk_level IS NOT NULL
        | STATS count = COUNT(*) BY risk_level
        | SORT count DESC
    `;

    const response = await esqlQuery(query);
    const results = transformEsqlResponse(response);

    // Calculate percentages
    const total = results.reduce((sum, r) => sum + r.count, 0);
    return results.map(r => ({
        risk_level: r.risk_level,
        count: r.count,
        percentage: total > 0 ? Math.round((r.count / total) * 100) : 0
    }));
}

/**
 * Get crowd energy distribution
 */
export async function getEnergyDistribution() {
    console.log('[Analytics] Fetching energy distribution...');

    const query = `
        FROM ${INDEX_NAME}
        | WHERE stage == 1 AND crowd_energy IS NOT NULL
        | STATS count = COUNT(*) BY crowd_energy
        | SORT count DESC
    `;

    const response = await esqlQuery(query);
    const results = transformEsqlResponse(response);

    const total = results.reduce((sum, r) => sum + r.count, 0);
    return results.map(r => ({
        energy: r.crowd_energy,
        count: r.count,
        percentage: total > 0 ? Math.round((r.count / total) * 100) : 0
    }));
}

/**
 * Get average divergence score over time (last 7 days)
 */
export async function getDivergenceTrend() {
    console.log('[Analytics] Fetching divergence trend...');

    const query = `
        FROM ${INDEX_NAME}
        | WHERE stage == 3 AND divergence_score IS NOT NULL
        | EVAL day = DATE_TRUNC(1 day, created_at)
        | STATS avg_divergence = AVG(divergence_score), joke_count = COUNT(*) BY day
        | SORT day DESC
        | LIMIT 7
    `;

    const response = await esqlQuery(query);
    const results = transformEsqlResponse(response);

    return results.map(r => ({
        date: r.day,
        avg_divergence: Math.round(r.avg_divergence || 0),
        joke_count: r.joke_count
    })).reverse(); // Chronological order
}

/**
 * Get most common primary conflicts
 */
export async function getTopConflicts() {
    console.log('[Analytics] Fetching top conflicts...');

    const query = `
        FROM ${INDEX_NAME}
        | WHERE stage == 3 AND primary_conflict IS NOT NULL
        | EVAL primary_conflict = TO_LOWER(primary_conflict)
        | STATS count = COUNT(*) BY primary_conflict
        | SORT count DESC
        | LIMIT 5
    `;

    const response = await esqlQuery(query);
    return transformEsqlResponse(response);
}

/**
 * Get most common agent modes with high laugh potential
 */
export async function getSuccessfulModes() {
    console.log('[Analytics] Fetching successful modes...');

    const query = `
        FROM ${INDEX_NAME}
        | WHERE stage == 1 AND laugh_potential == "high"
        | STATS high_laugh_count = COUNT(*) BY agent_mode
        | SORT high_laugh_count DESC
    `;

    const response = await esqlQuery(query);
    return transformEsqlResponse(response);
}

/**
 * Get overall stats summary
 */
export async function getOverallStats() {
    console.log('[Analytics] Fetching overall stats...');

    // Count unique jokes (set_ids)
    const countQuery = `
        FROM ${INDEX_NAME}
        | WHERE stage == 1
        | STATS unique_jokes = COUNT_DISTINCT(set_id)
    `;

    const countResponse = await esqlQuery(countQuery);
    const countResults = transformEsqlResponse(countResponse);

    // Average divergence
    const avgQuery = `
        FROM ${INDEX_NAME}
        | WHERE stage == 3 AND divergence_score IS NOT NULL
        | STATS avg_divergence = AVG(divergence_score)
    `;

    const avgResponse = await esqlQuery(avgQuery);
    const avgResults = transformEsqlResponse(avgResponse);

    return {
        total_jokes: countResults[0]?.unique_jokes || 0,
        avg_divergence: Math.round(avgResults[0]?.avg_divergence || 0)
    };
}

/**
 * Get all insights in one call
 */
export async function getAllInsights() {
    console.log('[Analytics] Fetching all insights...');

    try {
        const [
            riskDistribution,
            energyDistribution,
            divergenceTrend,
            topConflicts,
            successfulModes,
            overallStats
        ] = await Promise.all([
            getRiskDistribution().catch(() => []),
            getEnergyDistribution().catch(() => []),
            getDivergenceTrend().catch(() => []),
            getTopConflicts().catch(() => []),
            getSuccessfulModes().catch(() => []),
            getOverallStats().catch(() => ({ total_jokes: 0, avg_divergence: 0 }))
        ]);

        return {
            summary: overallStats,
            riskDistribution,
            energyDistribution,
            divergenceTrend,
            topConflicts,
            successfulModes
        };
    } catch (error) {
        console.error('[Analytics] Error fetching insights:', error.message);
        throw error;
    }
}
