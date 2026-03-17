import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function useTourCheck(tourId: string, userId: string | undefined) {
  const [shouldShowTour, setShouldShowTour] = useState(false);
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
      if (!tours[tourId]) {
        setShouldShowTour(true);
      }
    };
    check();
  }, [userId, tourId, supabase]);

  const markComplete = async () => {
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
  };

  return { shouldShowTour, markComplete };
}
