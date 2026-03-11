interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="text-lg font-semibold text-crwn-text mb-2">{title}</h3>
      <p className="text-sm text-crwn-text-secondary max-w-sm">{description}</p>
    </div>
  );
}
