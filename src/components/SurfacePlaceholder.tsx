interface SurfacePlaceholderProps {
  title: string;
  description: string;
  plannedFor: string;
}

/**
 * Neutral placeholder for a permanent navigation surface whose behavior is
 * scheduled for a later Packet 0001 milestone. Keeps the shell complete without
 * implying anything about the user's data.
 */
export function SurfacePlaceholder({
  title,
  description,
  plannedFor,
}: SurfacePlaceholderProps) {
  return (
    <section className="screen">
      <h1 className="screen-title">{title}</h1>
      <p className="screen-body">{description}</p>
      <p className="screen-note">Planned for {plannedFor}.</p>
    </section>
  );
}
