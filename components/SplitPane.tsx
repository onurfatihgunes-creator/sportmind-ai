import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { PANE_GUTTER } from '@/constants/layout';

type Props = {
  /** Context: the list, the entity, the raw data. Leading side (right under RTL). */
  primary: ReactNode;
  /** Detail: the selected item, the analysis, the interpretation. */
  secondary: ReactNode;
  /** False renders exactly the stacked phone layout — see the note below on why this is
   *  a prop rather than two different call sites. */
  dual: boolean;
  primaryFlex?: number;
  secondaryFlex?: number;
  gutter?: number;
  /** 'stretch' for full-height panes that scroll independently; 'start' (default) when
   *  both panes sit inside one shared ScrollView and should keep their natural heights. */
  align?: 'start' | 'stretch';
  style?: StyleProp<ViewStyle>;
};

/**
 * Two panes side by side on a wide window, the same two blocks stacked on a phone.
 *
 * `dual` is a prop instead of the caller writing `wide ? <row/> : <>…</>` so that both
 * children keep the same position in the React tree across a fold, an unfold, a rotation
 * or a Split View resize. Swapping between two different JSX shapes at the same position
 * would unmount and remount everything under it — which on this app would mean Match
 * Analysis losing its selected tab and, worse, any screen that resolves a match or team
 * by id re-running that lookup purely because the device was opened. Here the fold only
 * ever changes flexDirection and a couple of flex values.
 *
 * flexDirection 'row' is mirrored automatically by React Native under RTL, so `primary`
 * lands on the right in Arabic without a second code path.
 */
export default function SplitPane({
  primary,
  secondary,
  dual,
  primaryFlex = 1,
  secondaryFlex = 1,
  gutter = PANE_GUTTER,
  align = 'start',
  style,
}: Props) {
  return (
    <View
      style={[
        dual ? styles.row : styles.column,
        dual && (align === 'stretch' ? styles.alignStretch : styles.alignStart),
        style,
      ]}
    >
      <View style={dual ? { flex: primaryFlex, minWidth: 0 } : undefined}>{primary}</View>
      {/* Rendered in both modes so the two panes never change their index among their
          siblings; collapsed to nothing when stacked. */}
      <View style={dual ? { width: gutter } : styles.collapsedGutter} />
      <View style={dual ? { flex: secondaryFlex, minWidth: 0 } : undefined}>{secondary}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  alignStart: { alignItems: 'flex-start' },
  alignStretch: { alignItems: 'stretch' },
  collapsedGutter: { width: 0, height: 0 },
});
