/**
 * Stage2List Component
 * Displays Stage 2 specific angles to explore, filtered by parent reaction
 */

export default function Stage2List({ paths, selectedFeedbackId }) {
    // Filter angles if a parent is selected
    const displayPaths = selectedFeedbackId
        ? paths.filter(p => p.parent_feedback_id === selectedFeedbackId)
        : paths;

    if (displayPaths.length === 0) {
        return (
            <div className="no-paths">
                {selectedFeedbackId
                    ? 'No angles for this reaction. Try selecting another card.'
                    : 'Select an audience reaction above to see specific angles to explore.'}
            </div>
        );
    }

    return (
        <div className="stage2-list">
            {displayPaths.map((angle, idx) => (
                <div key={angle.angle_id || angle.path_id || idx} className="stage2-item">
                    <span className="angle-name">
                        {angle.angle_name || angle.exploration_type || 'Angle'}
                    </span>
                    <span className="direction-text">
                        {angle.direction || angle.direction_summary}
                    </span>
                </div>
            ))}
        </div>
    );
}
