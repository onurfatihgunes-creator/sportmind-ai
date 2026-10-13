import { useEffect, useState } from 'react';
import type { Match } from '@/data/mockData';
import { fetchTeamUpcoming } from '@/data/liveData';

export type TeamUpcomingState = {
  /** True only while the on-demand lookup is in flight. */
  loading: boolean;
  matches: Match[];
  /** Fixtures that exist without a stored prediction yet — the only case where "analysis is
   *  being prepared" is true. */
  awaitingAnalysis: number;
};

/**
 * A team's next analysed matches. The loaded match window answers first and costs nothing: its
 * rows are the earliest in the schedule, so if the team has any there, those ARE its next ones.
 * Only when the window holds none does it ask the database for the team's own fixtures — so a
 * team whose next match is beyond the window is no longer reported as having none, and an empty
 * answer means the database really has no fixture for it. Offline / demo data never asks.
 */
export function useTeamUpcoming(teamId: string | undefined, windowMatches: Match[], isLive: boolean): TeamUpcomingState {
  const [fetched, setFetched] = useState<{ teamId: string; matches: Match[]; awaitingAnalysis: number } | null>(null);
  const needsLookup = Boolean(teamId) && isLive && windowMatches.length === 0;

  useEffect(() => {
    if (!needsLookup || !teamId) return;
    let cancelled = false;
    fetchTeamUpcoming(teamId)
      .then((result) => {
        if (!cancelled) setFetched({ teamId, ...result });
      })
      .catch(() => {
        if (!cancelled) setFetched({ teamId, matches: [], awaitingAnalysis: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [needsLookup, teamId]);

  if (windowMatches.length > 0) return { loading: false, matches: windowMatches, awaitingAnalysis: 0 };
  if (!needsLookup) return { loading: false, matches: [], awaitingAnalysis: 0 };
  if (fetched && fetched.teamId === teamId) return { loading: false, matches: fetched.matches, awaitingAnalysis: fetched.awaitingAnalysis };
  return { loading: true, matches: [], awaitingAnalysis: 0 };
}
