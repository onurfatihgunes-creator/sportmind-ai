/**
 * Regression for avatars whose 3-letter code spilled out of (or wrapped inside) the circle: the
 * text now ignores the system font scale and is sized for its character count. The avatar is
 * text-only on purpose (no crest images, so no third-party image requests).
 */
import { Image, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import TeamAvatar, { avatarFontSize } from './TeamAvatar';

const base = { code: 'NEW', bg: '#dbe6f2', fg: '#2f4f72' };

function render(team: Parameters<typeof TeamAvatar>[0]['team'], size = 30) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(<TeamAvatar team={team} size={size} />);
  });
  return r;
}

describe('avatarFontSize', () => {
  it('uses a smaller em for more characters, so three capitals fit where one would', () => {
    for (const size of [26, 28, 30, 34, 52]) {
      expect(avatarFontSize('NEW', size)).toBeLessThan(avatarFontSize('NE', size));
      expect(avatarFontSize('NE', size)).toBeLessThan(avatarFontSize('N', size));
    }
  });

  it('keeps three bold capitals inside the circle even at the widest-letter worst case (0.85em each)', () => {
    for (const size of [26, 28, 30, 34, 52]) {
      expect(3 * 0.85 * avatarFontSize('WWW', size)).toBeLessThanOrEqual(size * 0.85);
    }
  });
});

describe('TeamAvatar', () => {
  it('shows the code on one line, centred, ignoring the system font scale', () => {
    const text = render(base).root.findByType(Text);
    expect(text.props.children).toBe('NEW');
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.allowFontScaling).toBe(false);
    expect(text.props.adjustsFontSizeToFit).toBe(true);
  });

  it('is exactly the requested size and circular, whatever the code', () => {
    for (const code of ['A', 'AB', 'ABC']) {
      const circle = render({ ...base, code }, 34).toJSON() as unknown as { props: { style: unknown } };
      const flat = Object.assign({}, ...[circle.props.style].flat(Infinity as never)) as Record<string, number>;
      expect(flat.width).toBe(34);
      expect(flat.height).toBe(34);
      expect(flat.borderRadius).toBe(17);
    }
  });

  it('trims, uppercases and caps the code at three characters', () => {
    expect(render({ ...base, code: ' abcd ' }).root.findByType(Text).props.children).toBe('ABC');
  });

  it('never loads an image, even if the team object happens to carry a crest URL — no third-party requests', () => {
    const withCrest = { ...base, logoUrl: 'https://crests.example.test/57.png' } as Parameters<typeof TeamAvatar>[0]['team'];
    const r = render(withCrest);
    expect(r.root.findAllByType(Image)).toHaveLength(0);
    expect(r.root.findByType(Text).props.children).toBe('NEW');
  });
});
