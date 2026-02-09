/**
 * Stage1Card Component
 * Displays a single Stage 1 audience reaction as a clickable card
 */

export default function Stage1Card({
    feedback,
    isSelected,
    onClick,
    angles = []
}) {
    const {
        agent_mode,
        feedback_text,
        relatability,
        laugh_potential,
        crowd_energy,
        reason_codes = []
    } = feedback;

    return (
        <div
            className={`stage1-card ${isSelected ? 'selected' : ''}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick()}
        >
            <div className="card-header">
                <span className={`mode-badge ${agent_mode || ''}`}>
                    {agent_mode?.replace('_', ' ') || 'Unknown'}
                </span>
            </div>

            <p className="feedback-text">{feedback_text}</p>

            <div className="card-meta">
                {relatability && (
                    <span className={`level-pill relatability ${relatability}`}>
                        🎯 Relatable: {relatability}
                    </span>
                )}
                {laugh_potential && (
                    <span className={`level-pill laugh ${laugh_potential}`}>
                        😂 Laugh: {laugh_potential}
                    </span>
                )}
                {crowd_energy && (
                    <span className={`level-pill energy ${crowd_energy}`}>
                        🔥 Energy: {crowd_energy}
                    </span>
                )}
            </div>

            {reason_codes.length > 0 && (
                <div className="reason-codes">
                    {reason_codes.map((code, idx) => (
                        <span key={idx} className="reason-chip">{code}</span>
                    ))}
                </div>
            )}

            {isSelected && angles.length > 0 && (
                <div className="card-angles">
                    <div className="angles-header">
                        <span className="angles-icon">📐</span>
                        Strategic Angles
                    </div>
                    <div className="angles-list">
                        {angles.map((angle, idx) => (
                            <div key={angle.angle_id || idx} className="angle-item-embedded">
                                <div className="angle-name">{angle.angle_name}</div>
                                <div className="angle-desc">{angle.direction}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
