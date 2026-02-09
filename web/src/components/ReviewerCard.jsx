/**
 * ReviewerCard.jsx
 * Displays the Stage 2 Critical Analysis (formerly Stage 3 Reviewer)
 * Shows reasoning, divergence score, risk level, and recommendations
 */

import { useState } from 'react';

/**
 * Get color for risk level
 */
function getRiskColor(riskLevel) {
    switch (riskLevel?.toLowerCase()) {
        case 'low':
            return 'var(--success-color, #22c55e)';
        case 'medium':
            return 'var(--warning-color, #f59e0b)';
        case 'high':
            return 'var(--error-color, #ef4444)';
        default:
            return 'var(--text-muted, #9ca3af)';
    }
}

/**
 * Get emoji for risk level
 */
function getRiskEmoji(riskLevel) {
    switch (riskLevel?.toLowerCase()) {
        case 'low': return '✅';
        case 'medium': return '⚠️';
        case 'high': return '🚨';
        default: return '❓';
    }
}

/**
 * Divergence gauge component
 */
function DivergenceGauge({ score }) {
    const normalizedScore = Math.min(100, Math.max(0, score || 0));
    const gaugeColor = normalizedScore > 70 ? '#ef4444' : normalizedScore > 40 ? '#f59e0b' : '#22c55e';

    return (
        <div className="divergence-gauge">
            <div className="gauge-header">
                <span className="gauge-title">Divergence Score</span>
                <span className="gauge-value" style={{ color: gaugeColor }}>{normalizedScore}/100</span>
            </div>
            <div className="gauge-track">
                <div
                    className="gauge-fill"
                    style={{
                        width: `${normalizedScore}%`,
                        backgroundColor: gaugeColor
                    }}
                />
            </div>
            <div className="gauge-labels">
                <span>Consensus</span>
                <span>Polarized</span>
            </div>
        </div>
    );
}

/**
 * Main ReviewerCard component
 */
export default function ReviewerCard({ stage3 }) {
    const [isExpanded, setIsExpanded] = useState(true);

    if (!stage3) {
        return null;
    }

    const {
        reasoning,
        divergence_score,
        risk_level,
        primary_conflict,
        conflict_summary,
        recommendation
    } = stage3;

    // Filter out "unknown" or empty values
    const hasConflict = primary_conflict && primary_conflict.toLowerCase() !== 'unknown';
    const hasReasoning = reasoning && reasoning !== 'Analysis pending...';

    return (
        <div className="reviewer-card">
            <div
                className="reviewer-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="reviewer-title-group">
                    <span className="stage-badge stage-badge-reviewer">2</span>
                    <div className="reviewer-title">
                        <span className="reviewer-icon">⚖️</span>
                        <span>Critical Analysis</span>
                    </div>
                </div>
                <div className="reviewer-meta">
                    <div className="reviewer-risk-badge" style={{ backgroundColor: getRiskColor(risk_level) }}>
                        <span>{getRiskEmoji(risk_level)}</span>
                        <span>{risk_level?.toUpperCase() || 'UNKNOWN'} RISK</span>
                    </div>
                    <span className="expand-indicator">{isExpanded ? '▼' : '▶'}</span>
                </div>
            </div>

            {isExpanded && (
                <div className="reviewer-content">
                    {/* Reasoning Section (New) */}
                    {hasReasoning && (
                        <div className="analysis-section">
                            <div className="section-label">
                                <span className="section-icon">🧠</span>
                                Agent Reasoning
                            </div>
                            <div className="reasoning-text">{reasoning}</div>
                        </div>
                    )}

                    <div className="metrics-grid">
                        <DivergenceGauge score={divergence_score} />

                        {hasConflict && (
                            <div className="conflict-box">
                                <div className="section-label">
                                    <span className="section-icon">🆚</span>
                                    Primary Conflict
                                </div>
                                <div className="conflict-title">{primary_conflict}</div>
                                {conflict_summary && conflict_summary !== 'Insufficient data for analysis' && (
                                    <div className="conflict-summary">{conflict_summary}</div>
                                )}
                            </div>
                        )}
                    </div>

                    {recommendation && recommendation !== 'No recommendation available' && (
                        <div className="recommendation-section">
                            <div className="section-label">
                                <span className="section-icon">💡</span>
                                Editor's Recommendation
                            </div>
                            <div className="recommendation-text">{recommendation}</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
