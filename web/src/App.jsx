/**
 * How It Lands - Main App Component
 * Demo UI for joke analysis via ES Agent Builder
 */

import { useState, useEffect } from 'react';
import Stage1Card from './components/Stage1Card';
import Stage2List from './components/Stage2List';
import HistoryList from './components/HistoryList';
import ReviewerCard from './components/ReviewerCard';
import SimilarJokes from './components/SimilarJokes';
import InsightsPanel from './components/InsightsPanel';

export default function App() {
    const [view, setView] = useState('new'); // 'new' | 'history' | 'insights'
    const [lineText, setLineText] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);
    const [selectedFeedbackId, setSelectedFeedbackId] = useState(null);
    const [notification, setNotification] = useState(null);

    // Auto-hide notification after 3 seconds
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type });
    };

    const handleGenerate = async () => {
        if (!lineText.trim()) return;

        setLoading(true);
        setError(null);
        setResults(null);
        setSelectedFeedbackId(null);

        try {
            showNotification('Connecting to comedy cortex...');

            // Use fetch with streaming response to consume SSE
            // Connect directly to Cloud Run to bypass Firebase Hosting buffering
            const response = await fetch('https://how-it-lands-server-532022675227.us-central1.run.app/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ line_text: lineText.trim() })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || 'Connection failed');
            }

            // Set up stream reader
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Initial accumulator for results
            let currentResults = {};

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // Parse events from buffer
                // SSE format: event: name\ndata: json\n\n
                const lines = buffer.split('\n\n');

                // Keep the last incomplete part in buffer
                buffer = lines.pop();

                for (const group of lines) {
                    const eventMatch = group.match(/event: (.*)\n/);
                    const dataMatch = group.match(/data: (.*)/);

                    if (eventMatch && dataMatch) {
                        const eventType = eventMatch[1].trim();
                        // Handle potential multiple data lines or simple JSON
                        const rawData = dataMatch[1];

                        let eventData;
                        try {
                            eventData = JSON.parse(rawData);
                        } catch (e) {
                            console.warn('Failed to parse SSE data', rawData);
                            continue;
                        }

                        switch (eventType) {
                            case 'start':
                                console.log('Analysis started:', eventData.set_id);
                                currentResults = { ...currentResults, set_id: eventData.set_id, line_text: lineText };
                                setResults(currentResults);
                                break;
                            case 'progress':
                                showNotification(eventData.message);
                                break;
                            case 'result_stage1':
                                currentResults = {
                                    ...currentResults,
                                    stage1: eventData.stage1,
                                    stage2: eventData.stage2
                                };
                                setResults(currentResults);
                                if (eventData.stage1?.length > 0) {
                                    setSelectedFeedbackId(eventData.stage1[0].feedback_id);
                                }
                                break;
                            case 'result_stage3':
                                currentResults = { ...currentResults, stage3: eventData.stage3 };
                                setResults(currentResults);
                                break;
                            case 'ping':
                                // Heartbeat, ignore
                                break;
                            case 'error':
                                throw new Error(eventData.message);
                            case 'done':
                                showNotification('Analysis complete!');
                                break;
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Analysis error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCardClick = (feedbackId) => {
        setSelectedFeedbackId(
            selectedFeedbackId === feedbackId ? null : feedbackId
        );
    };

    const handleSelectFromHistory = (data) => {
        setResults(data);
        setLineText(data.line_text || '');
        setView('new');

        // Auto-select first feedback
        if (data.stage1?.length > 0) {
            setSelectedFeedbackId(data.stage1[0].feedback_id);
        }

        showNotification('Joke loaded from history');
    };

    const handleNewJoke = () => {
        setLineText('');
        setResults(null);
        setError(null);
        setSelectedFeedbackId(null);
        setView('new');
    };

    return (
        <div className="app">
            {/* Butter Bar Notification */}
            {notification && (
                <div className={`butter-bar ${notification.type}`}>
                    {notification.message}
                </div>
            )}

            <header className="app-header">
                <div className="header-top">
                    <h1 className="app-title">How It Lands</h1>
                    <div className="view-toggle">
                        <button
                            className={`toggle-btn ${view === 'new' ? 'active' : ''}`}
                            onClick={handleNewJoke}
                        >
                            New
                        </button>
                        <button
                            className={`toggle-btn ${view === 'history' ? 'active' : ''}`}
                            onClick={() => setView('history')}
                        >
                            History
                        </button>
                        <button
                            className={`toggle-btn ${view === 'insights' ? 'active' : ''}`}
                            onClick={() => setView('insights')}
                        >
                            Insights
                        </button>
                    </div>
                </div>
                <p className="app-subtitle">
                    See how your jokes might land with different audiences
                </p>
            </header>

            {/* New Joke View */}
            {view === 'new' && (
                <>
                    <section className="input-section">
                        <label className="input-label" htmlFor="line-input">
                            Enter a joke or bit
                        </label>
                        <textarea
                            id="line-input"
                            className="input-textarea"
                            placeholder="e.g., I told my wife she was drawing her eyebrows too high. She looked surprised."
                            value={lineText}
                            onChange={(e) => setLineText(e.target.value)}
                            disabled={loading}
                        />
                        <button
                            className="generate-btn"
                            onClick={handleGenerate}
                            disabled={loading || !lineText.trim()}
                        >
                            {loading ? 'Analyzing...' : 'Generate Feedback'}
                        </button>
                    </section>

                    {loading && (
                        <div className="loading-container">
                            <div className="spinner"></div>
                            <p>Analyzing your joke...</p>
                            <p className="loading-subtext">Consulting the council of comedy...</p>
                        </div>
                    )}

                    {error && (
                        <div className="error">
                            <div className="error-title">Analysis Failed</div>
                            <div>{error}</div>
                        </div>
                    )}

                    {results && (
                        <div className="results-section">
                            {/* Stage 1: Audience Reactions */}
                            <section className="stage-section">
                                <div className="stage-header">
                                    <span className="stage-badge">1</span>
                                    <h2 className="stage-title">The Room (Audience Reactions)</h2>
                                    <span className="stage-subtitle">
                                        {results.stage1?.length || 0} perspectives
                                    </span>
                                </div>

                                {results.stage1?.length > 0 ? (
                                    <div className="stage1-grid">
                                        {results.stage1.map((feedback, idx) => (
                                            <Stage1Card
                                                key={feedback.feedback_id || idx}
                                                feedback={feedback}
                                                isSelected={selectedFeedbackId === feedback.feedback_id}
                                                onClick={() => handleCardClick(feedback.feedback_id)}
                                                angles={results.stage2?.filter(
                                                    a => a.parent_feedback_id === feedback.feedback_id
                                                )}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="empty-state">
                                        <div className="empty-icon">📭</div>
                                        <p>No feedback generated</p>
                                    </div>
                                )}
                            </section>

                            {/* Stage 2: Critical Analysis (formerly Reviewer) */}
                            {results.stage3 && (
                                <section className="stage-section reviewer-section">
                                    <ReviewerCard stage3={results.stage3} />
                                </section>
                            )}

                            {/* Stage 3: The Archive (Similar Jokes) */}
                            {results.line_text && (
                                <section className="stage-section similar-section">
                                    <SimilarJokes
                                        lineText={results.line_text || lineText}
                                        setId={results.set_id}
                                    />
                                </section>
                            )}
                        </div>
                    )}
                </>
            )}

            {view === 'history' && (
                <section className="history-section">
                    <HistoryList
                        onSelectJoke={handleSelectFromHistory}
                        onNotification={showNotification}
                    />
                </section>
            )}

            {/* Insights View */}
            {view === 'insights' && (
                <section className="insights-section">
                    <InsightsPanel />
                </section>
            )}
        </div>
    );
}
