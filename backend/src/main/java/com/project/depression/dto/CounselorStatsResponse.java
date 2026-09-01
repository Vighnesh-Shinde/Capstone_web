package com.project.depression.dto;

public record CounselorStatsResponse(
        long totalSessions,
        long totalParticipants,
        long sessionsThisWeek,
        /** Completed sessions with no counselor judgment recorded yet — the counselor's to-do list. */
        long awaitingJudgment,
        long processing,
        long failed
) {
}
