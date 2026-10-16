import { act, renderHook } from '@testing-library/react-native';

import { useFormAction } from './use-form-action';

describe('useFormAction', () => {
  it('shows the message the action returns', async () => {
    const { result } = await renderHook(() => useFormAction());
    await act(() => result.current.run(async () => 'Wrong code.'));
    expect(result.current.error).toBe('Wrong code.');
    expect(result.current.loading).toBe(false);
  });

  it('clears an old error when the next action succeeds', async () => {
    const { result } = await renderHook(() => useFormAction());
    await act(() => result.current.run(async () => 'Wrong code.'));
    await act(() => result.current.run(async () => null));
    expect(result.current.error).toBeNull();
  });

  it('shows a generic message instead of failing silently when the action throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = await renderHook(() => useFormAction());
    await act(() =>
      result.current.run(async () => {
        throw new Error('boom');
      }),
    );
    expect(result.current.error).toBe('Something went wrong. Please try again.');
    expect(result.current.loading).toBe(false);
  });
});
