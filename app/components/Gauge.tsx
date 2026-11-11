export function Gauge({
  value,
  max,
  label,
  color = "#14B8A6",
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  const fraction = Math.max(0, Math.min(value / max, 1));
  const width = 60;
  const height = 34;
  const r = 22;
  const semicircumference = Math.PI * r;
  const offset = semicircumference * (1 - fraction);

  return (
    <svg width={width} height={height} role="img" aria-label={label}>
      <path
        d={`M ${8} ${30} A ${r} ${r} 0 0 1 ${52} ${30}`}
        fill="none"
        stroke="#1F2A37"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={`M ${8} ${30} A ${r} ${r} 0 0 1 ${52} ${30}`}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={semicircumference}
        strokeDashoffset={offset}
      />
      <text
        x={30}
        y={28}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#E5E7EB"
        fontSize={11}
        fontWeight={600}
      >
        {label}
      </text>
    </svg>
  );
}