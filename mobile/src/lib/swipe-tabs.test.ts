import { swipeTarget } from './swipe-tabs';

describe('swipeTarget', () => {
  it('swipes left to the next tab and right to the previous one', () => {
    expect(swipeTarget('index', -120, -300)).toBe('calendar');
    expect(swipeTarget('calendar', 120, 300)).toBe('index');
  });

  it('stays put at either end of the row', () => {
    expect(swipeTarget('index', 120, 300)).toBeNull();
    expect(swipeTarget('calendar', -120, -300)).toBeNull();
  });

  it('ignores short, slow drags but accepts a quick flick', () => {
    expect(swipeTarget('index', -20, -100)).toBeNull();
    expect(swipeTarget('index', -20, -900)).toBe('calendar');
  });

  it('ignores a flick that reverses the drag direction', () => {
    expect(swipeTarget('index', -20, 900)).toBeNull();
  });

  it('never swipes away from the scanner or an unknown tab', () => {
    expect(swipeTarget('check-in', -200, -900)).toBeNull();
    expect(swipeTarget('nope', -200, -900)).toBeNull();
  });
});
