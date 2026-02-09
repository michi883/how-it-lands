/**
 * HistoryList Component
 * Displays list of past jokes with delete functionality
 */

import { useState, useEffect } from 'react';

export default function HistoryList({ onSelectJoke, onNotification }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const limit = 20;

    const fetchJokes = async (newOffset = 0) => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/history?limit=${limit}&offset=${newOffset}`);

            if (!response.ok) {
                throw new Error('Failed to fetch history');
            }

            const data = await response.json();
            setItems(data.items || []);
            setTotal(data.total || 0);
            setOffset(newOffset);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJokes(0);
    }, []);

    const handleDelete = async (set_id, e) => {
        e.stopPropagation();

        try {
            const response = await fetch(`/api/history/${set_id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete');
            }

            // Remove from local state
            setItems(prev => prev.filter(item => item.set_id !== set_id));
            setTotal(prev => prev - 1);

            // Show notification
            if (onNotification) {
                onNotification('Joke deleted successfully');
            }
        } catch (err) {
            if (onNotification) {
                onNotification('Failed to delete joke', 'error');
            }
        }
    };

    const handleLoadJoke = async (item) => {
        try {
            const response = await fetch(`/api/results?set_id=${item.set_id}`);

            if (!response.ok) {
                throw new Error('Failed to load joke');
            }

            const data = await response.json();

            if (onSelectJoke) {
                onSelectJoke({
                    set_id: item.set_id,
                    line_text: item.line_text,
                    stage1: data.stage1 || [],
                    stage2: data.stage2 || [],
                    stage3: data.stage3 || null
                });
            }
        } catch (err) {
            if (onNotification) {
                onNotification('Failed to load joke', 'error');
            }
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const truncateText = (text, maxLength = 80) => {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    if (loading && items.length === 0) {
        return (
            <div className="history-loading">
                <div className="spinner" />
                <p>Loading history...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="history-error">
                <p>Failed to load history: {error}</p>
                <button onClick={() => fetchJokes(0)}>Retry</button>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="history-empty">
                <div className="empty-icon">📝</div>
                <p>No jokes analyzed yet</p>
                <p className="hint">Switch to "New" to analyze your first joke!</p>
            </div>
        );
    }

    return (
        <div className="history-list">
            {items.map(item => (
                <div
                    key={item.set_id}
                    className="history-item"
                    onClick={() => handleLoadJoke(item)}
                >
                    <div className="history-content">
                        <p className="history-text">{truncateText(item.line_text)}</p>
                        <span className="history-date">{formatDate(item.created_at)}</span>
                    </div>
                    <button
                        className="delete-btn"
                        onClick={(e) => handleDelete(item.set_id, e)}
                        title="Delete"
                    >
                        🗑️
                    </button>
                </div>
            ))}

            {/* Pagination */}
            {total > limit && (
                <div className="pagination">
                    <button
                        disabled={offset === 0}
                        onClick={() => fetchJokes(Math.max(0, offset - limit))}
                    >
                        ← Previous
                    </button>
                    <span className="page-info">
                        {offset + 1}-{Math.min(offset + limit, total)} of {total}
                    </span>
                    <button
                        disabled={offset + limit >= total}
                        onClick={() => fetchJokes(offset + limit)}
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}
