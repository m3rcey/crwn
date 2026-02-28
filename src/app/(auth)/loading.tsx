import { Loader2 } from 'lucide-react';

export default function AuthLoading() {
  return (
    <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
    </div>
  );
}
