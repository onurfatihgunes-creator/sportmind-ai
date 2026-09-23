import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAppData } from '@/contexts/DataContext';
import type { ThemeColors } from '@/constants/theme';

/**
 * Blocks every real screen from mounting until DataContext's own initial fetch has
 * settled (live data loaded, or genuinely failed) — root fix for mock fixtures rendering
 * indistinguishably from real ones for the 2-6s that fetch takes (confirmed live: no
 * screen previously checked `loading`, only `isLive`, so mock content and a real
 * NotFoundState for a real deep-linked id/match could both render before the real
 * answer arrived). A plain spinner in the app's own background/primary colors — no
 * screen underneath ever sees `loading: true`, so none of them need their own copy of
 * this check. Once `loading` is false, DataContext.isLive tells the honest, unchanged
 * story: true is real data, false is the existing mock-fallback/"Demo data" behavior
 * for a genuine fetch failure (see lib/supabase.ts / app/(tabs)/index.tsx).
 */
export default function DataGate({ children, colors }: { children: ReactNode; colors: ThemeColors }) {
  const { loading } = useAppData();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}
