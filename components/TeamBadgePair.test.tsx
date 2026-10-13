/**
 * Regression: the second avatar of a pair used to carry its separating ring as a border INSIDE its
 * box, which shrank its filled circle below the first one's (26dp next to 30dp). Both circles must
 * be the full requested size; the ring lives outside, on a wrapper.
 */
import TestRenderer, { act } from 'react-test-renderer';
import TeamAvatar from './TeamAvatar';
import TeamBadgePair from './TeamBadgePair';

jest.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ colors: { surface: '#1b1b24' } }) }));

const home = { id: 'h', name: 'RB Leipzig', code: 'RBL', bg: '#e6ecf5', fg: '#2c4f7c', form: [], sport: 'football' } as never;
const away = { id: 'a', name: 'PSV', code: 'PSV', bg: '#dce6f2', fg: '#2c4f7c', form: [], sport: 'football' } as never;

describe('TeamBadgePair', () => {
  it('renders both avatars at exactly the same size, with no border eating into either circle', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<TeamBadgePair home={home} away={away} size={30} />);
    });
    const avatars = r.root.findAllByType(TeamAvatar);
    expect(avatars).toHaveLength(2);
    expect(avatars.map((a) => a.props.size)).toEqual([30, 30]);
    for (const a of avatars) {
      const style = Object.assign({}, ...[a.props.style].flat(Infinity as never).filter(Boolean)) as Record<string, unknown>;
      expect(style.borderWidth).toBeUndefined();
    }
  });
});
