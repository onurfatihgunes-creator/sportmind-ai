/**
 * How much of the schedule the app loads up front, per sport.
 *
 * Time-based on purpose. It used to be "the next 30 matches" — which, measured live, was about
 * 36 hours and two competitions, leaving most fixtures (and most teams) invisible.
 */
/** Everything kicking off within this many days is loaded… */
export const MATCHES_WINDOW_DAYS = 7;
/** …up to this many rows per sport (a safety cap on payload and on the Explore list). */
export const MATCHES_WINDOW_CAP_PER_SPORT = 150;
/** A sport with fewer than this many matches in the window (basketball between seasons) falls
 *  back to its next this-many upcoming matches, so it is never empty. */
export const MATCHES_MIN_PER_SPORT = 30;
/** Home's "matches of the day" is a different question from Explore's "what is coming up": only
 *  matches that have NOT started yet and kick off within this many hours qualify. Past matches and
 *  matches days away (a week of football, or an NBA opener a week out that the loader keeps so
 *  basketball is never empty) are Explore's business, never "of the day". A rolling window rather
 *  than a calendar day, so there is no midnight cliff; it is an instant comparison, so UTC vs
 *  local time only matters for how a kickoff is labelled, not for whether it qualifies. */
export const HOME_DAY_WINDOW_HOURS = 24;
/** Safety cap on how many of those Home ranks. */
export const HOME_POOL_PER_SPORT = 30;
