/**
 * Regression coverage for the live-reproduced mis-tap bug: TeamPicker used to render and
 * accept taps on its caller's small, transient team list immediately, then silently swap
 * to the full ~750-team list the moment that fetch resolved — a tap landing mid-swap could
 * select a different team than the one visually tapped (confirmed live: tapping
 * "Charlotte FC" selected "AFC Ajax"). `loading` now keeps the list non-interactive until
 * the caller's fetch has settled into one final, stable list.
 */
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import TeamPicker from './TeamPicker';
import type { Team } from '@/data/mockData';

const teams: Record<string, Team> = {
  charlotte: { id: 'charlotte', name: 'Charlotte FC', code: 'CHA', bg: '#000', fg: '#fff', form: [], sport: 'football' },
  ajax: { id: 'ajax', name: 'AFC Ajax', code: 'AJA', bg: '#000', fg: '#fff', form: [], sport: 'football' },
};

function baseProps() {
  return {
    visible: true,
    onClose: jest.fn(),
    onSelect: jest.fn(),
    teams,
    matches: [],
    excludeIds: [],
    search: '',
    onSearchChange: jest.fn(),
    title: 'Add Team',
  };
}

test('while loading, no team row is rendered — the list is never tappable mid-swap', () => {
  const props = baseProps();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TeamPicker {...props} loading />);
  });
  expect(renderer.root.findAllByType(Text).some((n) => n.props.children === 'Charlotte FC')).toBe(false);
  expect(renderer.root.findAllByType(Text).some((n) => n.props.children === 'AFC Ajax')).toBe(false);
});

test('once settled (not loading), tapping the row rendered for one team selects that exact team by its stable id — never a different one', () => {
  const props = baseProps();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TeamPicker {...props} loading={false} />);
  });

  // Located by the row's own accessibilityLabel (its real per-row identity, same as a
  // screen reader or a real tap would use) rather than array position — firing its
  // onPress is exactly what a real tap invokes.
  const row = renderer.root.findByProps({ accessibilityLabel: 'Charlotte FC' });
  act(() => {
    (row.props as { onPress: () => void }).onPress();
  });

  expect(props.onSelect).toHaveBeenCalledTimes(1);
  expect(props.onSelect).toHaveBeenCalledWith('charlotte');
});
