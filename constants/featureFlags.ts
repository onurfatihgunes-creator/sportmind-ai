/**
 * Whether SportMind sells anything right now: the Premium screen, the trial countdown, upgrade /
 * restore buttons, paywalls on Match Analysis and Explore, and every call that would start a
 * purchase or ask a server who is a subscriber.
 *
 * FALSE for the first release: everything the app analyses is free to open, and nothing about
 * buying is visible or reachable. Nothing is deleted — RevenueCat, the Vera entitlement client,
 * the trial migration and the Premium screen all stay in place, switched off at their entrances
 * by this one constant. Stored trial / Pro information on the device and server is never read,
 * written or reset while it is false.
 *
 * Turning it back on (set to `true`, rebuild) restores the previous behaviour exactly: the
 * Premium pill, Profile plan row and upsell cards, the paywalls, the /premium route and the
 * RevenueCat / entitlement reads all come back as they were.
 */
export const PURCHASES_ENABLED = false;
