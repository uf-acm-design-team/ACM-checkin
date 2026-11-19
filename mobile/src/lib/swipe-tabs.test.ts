import { clampDrag, footerToPage, swipeTarget } from './swipe-tabs';

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

describe('clampDrag', () => {
  it('lets Home drag left toward Calendar, up to one page, but not right', () => {
    expect(clampDrag('index', -120, 400)).toBe(-120);
    expect(clampDrag('index', -900, 400)).toBe(-400);
    expect(clampDrag('index', 80, 400)).toBe(0);
  });

  it('lets Calendar drag right toward Home, but not left', () => {
    expect(clampDrag('calendar', 150, 400)).toBe(150);
    expect(clampDrag('calendar', -50, 400)).toBe(0);
  });

  it('never moves the scanner', () => {
    expect(clampDrag('check-in', -200, 400)).toBe(0);
  });
});

describe('footerToPage', () => {
  it('moves the pages the other way, one page per tab width', () => {
    expect(footerToPage(80, 160, 400)).toBe(-200);
    expect(footerToPage(-160, 160, 400)).toBe(400);
  });

  it('does nothing before the footer has a size', () => {
    expect(footerToPage(80, 0, 400)).toBe(0);
  });
});
