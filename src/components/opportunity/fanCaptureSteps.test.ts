import { describe, it, expect } from 'vitest';
import { visibleSteps, FAN_CAPTURE_STEPS } from './fanCaptureSteps';

describe('fan-capture signup-boundary variant', () => {
  it("control ('save') shows the full flow, ending on the preview (max value before signup)", () => {
    const steps = visibleSteps('save');
    expect(steps).toHaveLength(4);
    expect(steps[steps.length - 1].id).toBe('preview');
    expect(steps).toEqual(FAN_CAPTURE_STEPS);
  });

  it("'preview' moves the boundary one step earlier (drops the in-wizard preview)", () => {
    const steps = visibleSteps('preview');
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.id)).toEqual(['goal', 'copy', 'capture']);
    expect(steps.some((s) => s.id === 'preview')).toBe(false);
  });

  it('defaults to the full control flow for null/undefined (nothing changes when no experiment runs)', () => {
    expect(visibleSteps(null)).toEqual(FAN_CAPTURE_STEPS);
    expect(visibleSteps(undefined)).toEqual(FAN_CAPTURE_STEPS);
  });

  it('never mutates the source step list', () => {
    visibleSteps('preview');
    expect(FAN_CAPTURE_STEPS).toHaveLength(4);
  });
});
