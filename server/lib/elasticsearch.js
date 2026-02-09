/**
 * Elasticsearch helper functions
 * Handles index management and document queries
 */

const ES_URL = process.env.ES_URL;
const ES_API_KEY = process.env.ES_API_KEY;
const INDEX_NAME = 'how-it-lands';

/**
 * ES index mapping for Stage 1 and Stage 2 documents
 */
const INDEX_MAPPING = {
  mappings: {
    properties: {
      set_id: { type: 'keyword' },
      line_id: { type: 'keyword' },
      line_text: { type: 'text' },
      stage: { type: 'integer' },
      // Stage 1 fields
      agent_mode: { type: 'keyword' },
      feedback_id: { type: 'keyword' },
      feedback_text: { type: 'text' },
      reason_codes: { type: 'keyword' },
      relatability: { type: 'keyword' },
      laugh_potential: { type: 'keyword' },
      crowd_energy: { type: 'keyword' },
      // Stage 2 fields
      angle_id: { type: 'keyword' },
      parent_feedback_id: { type: 'keyword' },
      angle_name: { type: 'keyword' },
      direction: { type: 'text' },
      // Legacy fields for backward compatibility
      path_id: { type: 'keyword' },
      exploration_type: { type: 'keyword' },
      direction_summary: { type: 'text' },
      // Stage 3 (Reviewer) fields
      divergence_score: { type: 'integer' },
      risk_level: { type: 'keyword' },
      primary_conflict: { type: 'keyword' },
      conflict_summary: { type: 'text' },
      recommendation: { type: 'text' },
      // Metadata
      created_at: { type: 'date' },
      hypothesis: { type: 'boolean' }
    }
  }
};

/**
 * Validates ES environment variables
 */
export function validateESConfig() {
  if (!ES_URL) {
    throw new Error('Missing required environment variable: ES_URL');
  }
  if (!ES_API_KEY) {
    throw new Error('Missing required environment variable: ES_API_KEY');
  }
}

/**
 * Make an authenticated request to Elasticsearch
 */
async function esRequest(method, path, body = null) {
  const url = `${ES_URL}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': `ApiKey ${ES_API_KEY}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  // HEAD requests return no body, handle gracefully
  let data = null;
  if (method !== 'HEAD') {
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        // Non-JSON response
        data = { raw: text };
      }
    }
  }

  if (!response.ok && response.status !== 404) {
    console.error('[ES Error]', response.status, data);
    throw new Error(`Elasticsearch error: ${response.status} - ${JSON.stringify(data)}`);
  }

  return { status: response.status, data };
}

/**
 * Ensure the index exists, create if missing
 */
export async function ensureIndex() {
  console.log(`[ES] Checking if index '${INDEX_NAME}' exists...`);

  const { status } = await esRequest('HEAD', `/${INDEX_NAME}`);

  if (status === 404) {
    console.log(`[ES] Index '${INDEX_NAME}' not found, creating...`);
    await esRequest('PUT', `/${INDEX_NAME}`, INDEX_MAPPING);
    console.log(`[ES] Index '${INDEX_NAME}' created successfully`);
  } else {
    console.log(`[ES] Index '${INDEX_NAME}' already exists, updating mapping...`);
    // Ensure mapping is up to date for new fields
    await esRequest('PUT', `/${INDEX_NAME}/_mapping`, INDEX_MAPPING.mappings);
    console.log(`[ES] Index '${INDEX_NAME}' mapping updated`);
  }
}

/**
 * Store Stage 1, Stage 2, and Stage 3 documents to Elasticsearch
 * @param {Object} params
 * @param {string} params.set_id - Set identifier
 * @param {string} params.line_id - Line identifier
 * @param {string} params.line_text - Original line text
 * @param {Array} params.stage1 - Stage 1 feedback items
 * @param {Array} params.stage2 - Stage 2 exploration paths
 * @param {Object} params.stage3 - Stage 3 reviewer assessment (optional)
 */
export async function storeDocsToES({ set_id, line_id, line_text, stage1, stage2, stage3 = null }) {
  const now = new Date().toISOString();
  const docs = [];

  // Build Stage 1 docs
  for (const item of stage1) {
    docs.push({
      set_id,
      line_id,
      line_text,
      stage: 1,
      feedback_id: item.feedback_id,
      agent_mode: item.agent_mode,
      feedback_text: item.feedback_text,
      reason_codes: item.reason_codes || [],
      relatability: item.relatability,
      laugh_potential: item.laugh_potential,
      crowd_energy: item.crowd_energy,
      confidence: item.confidence,
      hypothesis: true,
      created_at: now
    });
  }

  // Build Stage 2 docs
  for (const item of stage2) {
    docs.push({
      set_id,
      line_id,
      line_text,
      stage: 2,
      angle_id: item.angle_id || item.path_id,
      parent_feedback_id: item.parent_feedback_id,
      angle_name: item.angle_name || item.exploration_type,
      direction: item.direction || item.direction_summary,
      hypothesis: true,
      created_at: now
    });
  }

  // Build Stage 3 doc (Reviewer assessment)
  if (stage3) {
    docs.push({
      set_id,
      line_id,
      line_text,
      stage: 3,
      divergence_score: stage3.divergence_score,
      risk_level: stage3.risk_level,
      primary_conflict: stage3.primary_conflict,
      conflict_summary: stage3.conflict_summary,
      recommendation: stage3.recommendation,
      hypothesis: true,
      created_at: now
    });
  }

  if (docs.length === 0) {
    console.warn('[ES] No documents to store - skipping bulk index');
    return { indexed: 0, errors: false };
  }

  console.log(`[ES] Storing ${docs.length} documents to index '${INDEX_NAME}'`);

  // Build NDJSON for bulk index
  const ndjson = docs.flatMap(doc => [
    JSON.stringify({ index: { _index: INDEX_NAME } }),
    JSON.stringify(doc)
  ]).join('\n') + '\n';

  const bulkResponse = await fetch(`${ES_URL}/_bulk`, {
    method: 'POST',
    headers: {
      'Authorization': `ApiKey ${ES_API_KEY}`,
      'Content-Type': 'application/x-ndjson'
    },
    body: ndjson
  });

  if (!bulkResponse.ok) {
    const errText = await bulkResponse.text();
    throw new Error(`ES bulk index error: ${bulkResponse.status} - ${errText}`);
  }

  const result = await bulkResponse.json();

  if (result.errors) {
    console.error('[ES] Bulk index had errors:', JSON.stringify(result.items.filter(i => i.index?.error)));
  } else {
    console.log(`[ES] Successfully indexed ${result.items.length} documents`);
  }

  return { indexed: result.items.length, errors: result.errors };
}

/**
 * Fetch documents from ES for a given set_id and line_id
 * Split into stage1, stage2, and stage3 arrays
 */
export async function fetchDocsFromES({ set_id, line_id }) {
  console.log(`[ES] Fetching docs for set_id=${set_id}, line_id=${line_id}`);

  const query = {
    query: {
      bool: {
        must: [
          { term: { set_id } },
          { term: { line_id } }
        ]
      }
    },
    size: 100,
    sort: [{ created_at: 'asc' }]
  };

  const { data } = await esRequest('POST', `/${INDEX_NAME}/_search`, query);

  const hits = data.hits?.hits || [];
  const docs = hits.map(hit => ({ id: hit._id, ...hit._source }));

  const stage1 = docs.filter(d => d.stage === 1);
  const stage2 = docs.filter(d => d.stage === 2);
  const stage3Docs = docs.filter(d => d.stage === 3);
  const stage3 = stage3Docs.length > 0 ? stage3Docs[0] : null;

  console.log(`[ES] Found ${stage1.length} Stage 1 docs, ${stage2.length} Stage 2 docs, ${stage3 ? 1 : 0} Stage 3 doc`);

  return { stage1, stage2, stage3 };
}

/**
 * Poll ES until we have enough docs or timeout
 * @returns {Promise<{stage1: Array, stage2: Array}>}
 */
export async function pollForResults({ set_id, line_id, timeoutMs = 10000, intervalMs = 500 }) {
  const startTime = Date.now();
  const minStage1 = 4;
  const minStage2 = 3;

  console.log(`[ES] Polling for results (timeout: ${timeoutMs}ms)...`);

  while (Date.now() - startTime < timeoutMs) {
    const { stage1, stage2 } = await fetchDocsFromES({ set_id, line_id });

    if (stage1.length >= minStage1 && stage2.length >= minStage2) {
      console.log(`[ES] Sufficient results found after ${Date.now() - startTime}ms`);
      return { stage1, stage2 };
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  // Return whatever we have after timeout
  console.log(`[ES] Timeout reached, returning partial results`);
  return await fetchDocsFromES({ set_id, line_id });
}

/**
 * Fetch history of all jokes (unique set_ids with their line_text)
 * @param {number} limit - Max number of entries to return
 * @param {number} offset - Pagination offset
 * @returns {Promise<{items: Array, total: number}>}
 */
export async function fetchHistory(limit = 20, offset = 0) {
  console.log(`[ES] Fetching history (limit: ${limit}, offset: ${offset})`);

  const query = {
    size: 0,
    aggs: {
      unique_sets: {
        composite: {
          size: 1000,
          sources: [
            { set_id: { terms: { field: 'set_id' } } }
          ]
        },
        aggs: {
          sample: {
            top_hits: {
              size: 1,
              _source: ['line_text', 'created_at'],
              sort: [{ created_at: 'desc' }]
            }
          }
        }
      }
    }
  };

  const { data } = await esRequest('POST', `/${INDEX_NAME}/_search`, query);

  if (!data.aggregations?.unique_sets?.buckets) {
    return { items: [], total: 0 };
  }

  const allItems = data.aggregations.unique_sets.buckets
    .map(bucket => {
      const hit = bucket.sample?.hits?.hits?.[0]?._source || {};
      return {
        set_id: bucket.key.set_id,
        line_text: hit.line_text || 'Unknown',
        created_at: hit.created_at || null
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const total = allItems.length;
  const paginatedItems = allItems.slice(offset, offset + limit);

  console.log(`[ES] Found ${total} history items, returning ${paginatedItems.length}`);

  return { items: paginatedItems, total };
}

/**
 * Delete all documents for a given set_id
 * @param {string} set_id - The set ID to delete
 * @returns {Promise<{deleted: number}>}
 */
export async function deleteBySetId(set_id) {
  console.log(`[ES] Deleting all documents for set_id: ${set_id}`);

  const query = {
    query: {
      term: { set_id }
    }
  };

  const { data } = await esRequest('POST', `/${INDEX_NAME}/_delete_by_query`, query);

  const deleted = data.deleted || 0;
  console.log(`[ES] Deleted ${deleted} documents`);

  return { deleted };
}

/**
 * Find jokes similar to the given text using semantic search
 * Uses ELSER sparse embedding via the inference API
 * @param {string} line_text - The joke text to find similar jokes for
 * @param {number} limit - Maximum number of similar jokes to return
 * @param {string} excludeSetId - Set ID to exclude from results (current joke)
 * @returns {Promise<Array>} - Array of similar jokes with their metadata
 */
export async function findSimilarJokes(line_text, limit = 5, excludeSetId = null) {
  console.log(`[ES] Finding similar jokes for: "${line_text.substring(0, 50)}..."`);

  try {
    // Use semantic search with ELSER inference endpoint
    const query = {
      size: 0,
      query: {
        bool: {
          must: [
            { term: { stage: 1 } },  // Only match Stage 1 docs (they have full feedback)
            {
              semantic: {
                field: 'line_text',
                query: line_text,
                inference_id: '.elser-2-elastic'
              }
            }
          ],
          must_not: excludeSetId ? [{ term: { set_id: excludeSetId } }] : []
        }
      },
      aggs: {
        unique_jokes: {
          terms: {
            field: 'set_id',
            size: limit
          },
          aggs: {
            sample: {
              top_hits: {
                size: 1,
                _source: ['set_id', 'line_text', 'divergence_score', 'risk_level', 'crowd_energy', 'created_at']
              }
            },
            max_score: {
              max: {
                script: '_score'
              }
            }
          }
        }
      }
    };

    const { data, status } = await esRequest('POST', `/${INDEX_NAME}/_search`, query);

    // If semantic search fails, fall back to more_like_this
    if (status !== 200 || !data.aggregations) {
      console.log('[ES] Semantic search failed, falling back to more_like_this');
      return await findSimilarJokesFallback(line_text, limit, excludeSetId);
    }

    const buckets = data.aggregations?.unique_jokes?.buckets || [];
    const results = buckets.map(bucket => {
      const hit = bucket.sample?.hits?.hits?.[0];
      return {
        set_id: bucket.key,
        line_text: hit?._source?.line_text || 'Unknown',
        score: bucket.max_score?.value || 0,
        divergence_score: hit?._source?.divergence_score,
        risk_level: hit?._source?.risk_level,
        crowd_energy: hit?._source?.crowd_energy,
        created_at: hit?._source?.created_at
      };
    });

    console.log(`[ES] Found ${results.length} similar jokes via semantic search`);
    return results;

  } catch (error) {
    console.error('[ES] Semantic search error:', error.message);
    return await findSimilarJokesFallback(line_text, limit, excludeSetId);
  }
}

/**
 * Fallback: Find similar jokes using more_like_this query
 */
async function findSimilarJokesFallback(line_text, limit = 5, excludeSetId = null) {
  console.log('[ES] Using more_like_this fallback for similar jokes');

  const query = {
    size: 0,
    query: {
      bool: {
        must: [
          { term: { stage: 1 } },
          {
            more_like_this: {
              fields: ['line_text', 'feedback_text'],
              like: line_text,
              min_term_freq: 1,
              min_doc_freq: 1
            }
          }
        ],
        must_not: excludeSetId ? [{ term: { set_id: excludeSetId } }] : []
      }
    },
    aggs: {
      unique_jokes: {
        terms: {
          field: 'set_id',
          size: limit
        },
        aggs: {
          sample: {
            top_hits: {
              size: 1,
              _source: ['set_id', 'line_text', 'crowd_energy', 'created_at']
            }
          }
        }
      }
    }
  };

  const { data } = await esRequest('POST', `/${INDEX_NAME}/_search`, query);
  const buckets = data.aggregations?.unique_jokes?.buckets || [];

  const results = buckets.map(bucket => {
    const hit = bucket.sample?.hits?.hits?.[0];
    return {
      set_id: bucket.key,
      line_text: hit?._source?.line_text || 'Unknown',
      score: bucket.doc_count,
      crowd_energy: hit?._source?.crowd_energy,
      created_at: hit?._source?.created_at
    };
  });

  console.log(`[ES] Found ${results.length} similar jokes via more_like_this`);
  return results;
}
