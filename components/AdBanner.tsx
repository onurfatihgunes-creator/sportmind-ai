import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { ADS_ENABLED, adUnitId } from '@/constants/ads';
import { useAdsReady } from '@/services/ads/adsRuntime';

/**
 * An anchored adaptive banner, shown at the end of a screen's content (not pinned over it).
 * It renders nothing until consent allows ad requests, and collapses completely when no ad is
 * available, so a failed or empty ad leaves no gap and no placeholder.
 */
export default function AdBanner({ placement }: { placement: 'homeBanner' | 'matchBanner' }) {
  const ready = useAdsReady();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!ADS_ENABLED || !ready || failed) return null;

  return (
    <View style={[styles.wrap, !loaded && styles.collapsed]} accessibilityElementsHidden={!loaded} importantForAccessibility={loaded ? 'auto' : 'no-hide-descendants'}>
      <BannerAd
        unitId={adUnitId(placement)}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center', marginTop: 16 },
  // Kept mounted (a banner has to be on screen to load) but takes no space and is invisible.
  collapsed: { height: 0, marginTop: 0, opacity: 0, overflow: 'hidden' },
});
