/**
 * InsightsPanel.jsx
 * Displays analytics and trends from ES|QL data
 */

import { useState, useEffect } from 'react';

function StatCard({ label, value, subtext }) {
    return (
        <div className="stat-card">
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
            {subtext && <div className="stat-subtext">{subtext}</div>}
        </div>
    );
}

function ProgressBar({ label, value, max, color }) {
    const percentage = Math.round((value / max) * 100);
    return (
        <div className="progress-item">
            <div className="progress-header">
                <span className="progress-label">{label}</span>
                <span className="progress-value">{value} ({percentage}%)</span>
            </div>
            <div className="progress-track">
                <div
                    className="progress-fill"
                    style={{ width: `${percentage}%`, backgroundColor: color }}
                />
            </div>
        </div>
    );
}

export default function InsightsPanel() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    useEffect(() => {
        fetchInsights();
    }, []);

    const fetchInsights = async () => {
        try {
            const response = await fetch('/api/insights');
            if (!response.ok) throw new Error('Failed to fetch insights');
            const result = await response.json();
            setData(result);
        } catch (err) {
            console.error('Error fetching insights:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="insights-loading">Loading insights...</div>;
    if (error) return <div className="insights-error">Error: {error}</div>;
    if (!data) return null;

    const { summary, riskDistribution, energyDistribution, topConflicts } = data;
    const totalJokes = summary?.total_jokes || 0;

    return (
        <div className="insights-panel">
            <h2 className="insights-title">Comedy Analytics (ES|QL)</h2>

            <div className="stats-grid">
                <StatCard
                    label="Total Jokes Analyzed"
                    value={totalJokes}
                />
                <StatCard
                    label="Avg Divergence Score"
                    value={summary?.avg_divergence || 0}
                    subtext="Higher = More polarized audience"
                />
            </div>

            <div className="charts-grid">
                {/* Risk Distribution */}
                <div className="chart-card">
                    <h3 className="chart-title">Risk Distribution</h3>
                    <div className="chart-content">
                        {riskDistribution.map(item => (
                            <ProgressBar
                                key={item.risk_level}
                                label={item.risk_level}
                                value={item.count}
                                max={totalJokes}
                                color={
                                    item.risk_level === 'high' ? '#ef4444' :
                                        item.risk_level === 'medium' ? '#f59e0b' : '#22c55e'
                                }
                            />
                        ))}
                    </div>
                </div>

                {/* Energy Distribution */}
                <div className="chart-card">
                    <h3 className="chart-title">Crowd Energy</h3>
                    <div className="chart-content">
                        {energyDistribution.map(item => (
                            <ProgressBar
                                key={item.energy}
                                label={item.energy}
                                value={item.count}
                                max={energyDistribution.reduce((a, b) => a + b.count, 0)}
                                color={
                                    item.energy === 'hot' ? '#ef4444' :
                                        item.energy === 'warm' ? '#f59e0b' : '#94a3b8'
                                }
                            />
                        ))}
                    </div>
                </div>

                {/* Top Conflicts */}
                <div className="chart-card full-width">
                    <h3 className="chart-title">Common Conflicts</h3>
                    <div className="conflicts-list">
                        {topConflicts.map((item, idx) => (
                            <div key={idx} className="conflict-item">
                                <span className="conflict-name">{item.primary_conflict}</span>
                                <span className="conflict-count">{item.count} occurrences</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
