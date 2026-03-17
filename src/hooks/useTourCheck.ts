import { useEffect, useState, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function useTourCheck(tourId: string, userId: string | undefined) {
  const [shouldShowTour, setShouldShowTour] = useState(false);
  const [startStep, setStartStep] = useState(0);
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('completed_tours')
        .eq('id', userId)
        .single();
      const tours = data?.completed_tours || {};
      const tourValue = tours[tourId];
      if (tourValue === true) {
        // Fully complete, don't show
        setShouldShowTour(false);
      } else if (typeof tourValue === 'number') {
        // Partially complete, resume from saved step
        setShouldShowTour(true);
        setStartStep(tourValue);
      } else {
        // Never started
        setShouldShowTour(true);
        setStartStep(0);
      }
    };
    check();
  }, [userId, tourId, supabase]);

  const markComplete = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('profiles')
      .select('completed_tours')
      .eq('id', userId)
      .single();
    const tours = data?.completed_tours || {};
    tours[tourId] = true;
    await supabase
      .from('profiles')
      .update({ completed_tours: tours })
      .eq('id', userId);
    setShouldShowTour(false);
  }, [userId, tourId, supabase]);

  const saveStep = useCallback(async (stepIndex: number) => {
    if (!userId) return;
    const { data } = await supabase
      .from('profiles')
      .select('completed_tours')
      .eq('id', userId)
      .single();
    const tours = data?.completed_tours || {};
    tours[tourId] = stepIndex;
    await supabase
      .from('profiles')
      .update({ completed_tours: tours })
      .eq('id', userId);
    setShouldShowTour(false);
  }, [userId, tourId, supabase]);

  return { shouldShowTour, startStep, markComplete, saveStep };
}
