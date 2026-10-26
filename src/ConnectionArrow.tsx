export function ConnectionArrow({
  id,
  size,
  color,
}: {
  id: string;
  size: number;
  color: string;
}) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="10"
      refY="5"
      markerWidth={size}
      markerHeight={size}
      markerUnits="userSpaceOnUse"
      orient="auto"
    >
      <path d="M 0 0 L 10 5 L 0 10 Z" fill={color} />
    </marker>
  );
}
