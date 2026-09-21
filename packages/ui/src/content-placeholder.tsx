/** Visible failure state for a missing component or asset. */
export function ContentPlaceholder({ name }: { name: string }) {
  return (
    <div className="content-placeholder" role="note">
      Unavailable: {name}
    </div>
  );
}
