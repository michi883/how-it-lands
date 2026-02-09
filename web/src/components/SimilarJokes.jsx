/**
 * SimilarJokes.jsx
 * Displays similar jokes found via semantic search
 * Lazy-loaded when user clicks to expand
 */

import { useState, useEffect } from 'react';

/**
 * SimilarJokes component - fetches and displays jokes similar to the current one
 */
export default function SimilarJokes({ lineText, setId }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [similarJokes, setSimilarJokes] = useState([]);
    const [hasFetched, setHasFetched] = useState(false);

    // Fetch similar jokes when expanded for the first time
    useEffect(() => {
        if (isExpanded && !hasFetched && lineText) {
            fetchSimilarJokes();
        }
    }, [isExpanded, hasFetched, lineText]);

    const fetchSimilarJokes = async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                line_text: lineText,
                limit: '5'
            });
            if (setId) {
                params.append('exclude_set_id', setId);
            }

            const response = await fetch(`/api/similar?${params}`);
            if (!response.ok) {
                throw new Error('Failed to fetch similar jokes');
            }

            const data = await response.json();
            setSimilarJokes(data.similar || []);
            setHasFetched(true);
        } catch (err) {
            console.error('Error fetching similar jokes:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getEnergyEmoji = (energy) => {
        switch (energy?.toLowerCase()) {
            case 'hot': return '🔥';
            case 'warm': return '☀️';
            case 'cold': return '❄️';
            default: return '•';
        }
    };

    return (
        <div className="similar-jokes-section">
            <div
                className="similar-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="similar-title-group">
                    <span className="stage-badge stage-badge-similar">3</span>
                    <div className="similar-title">
                        <span className="similar-icon">📚</span>
                        <span>The Archive (Similar Jokes)</span>
                    </div>
                </div>
                <span className="expand-indicator">{isExpanded ? '▼' : '▶'}</span>
            </div>

            {isExpanded && (
                <div className="similar-content">
                    {loading && (
                        <div className="similar-loading">
                            <span className="spinner-small" />
                            <span>Finding similar jokes...</span>
                        </div>
                    )}

                    {error && (
                        <div className="similar-error">
                            Unable to find similar jokes: {error}
                        </div>
                    )}

                    {!loading && !error && similarJokes.length === 0 && hasFetched && (
                        <div className="similar-empty">
                            No similar jokes found in your history yet.
                            <br />
                            <span className="hint">Analyze more jokes to build your comparison database!</span>
                        </div>
                    )}

                    {!loading && !error && similarJokes.length > 0 && (
                        <div className="similar-list">
                            {similarJokes.map((joke, idx) => (
                                <div key={joke.set_id || idx} className="similar-item">
                                    <div className="similar-joke-text">
                                        {joke.line_text}
                                    </div>
                                    <div className="similar-meta">
                                        <span className="energy-badge">
                                            {getEnergyEmoji(joke.crowd_energy)} {joke.crowd_energy || 'N/A'}
                                        </span>
                                        {joke.risk_level && (
                                            <span className={`risk-badge ${joke.risk_level}`}>
                                                {joke.risk_level} risk
                                            </span>
                                        )}
                                        <span className="score-badge">
                                            Score: {Math.round(joke.score * 100) / 100}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
