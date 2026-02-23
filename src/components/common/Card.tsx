interface Props {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, children, className = "" }: Props) {
  return (
    <div
      className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}
    >
      {title && (
        <div className="px-4 py-2.5 border-b border-[var(--color-border)] text-sm font-medium">
          {title}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
