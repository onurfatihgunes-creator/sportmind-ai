/** Web has no AdMob: every entry point is a no-op so the web preview and static export still work. */
export function useAdsReady(): boolean {
  return false;
}
export async function startAds(): Promise<void> {}
export function onMatchAnalysisClosed(): void {}
export function usePrivacyOptionsRequired(): boolean {
  return false;
}
export async function showAdPrivacyOptions(): Promise<void> {}
