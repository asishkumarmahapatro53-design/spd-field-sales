export function StatusBadge({ value }: { value: string }) {
  const className = `status-badge status-${value.toLowerCase()}`;
  return <span className={className}>{value.replaceAll("_", " ")}</span>;
}
