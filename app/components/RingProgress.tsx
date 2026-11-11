export function RingProgress({
  value,
  max,
  label,
  color = "#14B8A6",
  size = 56,
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
  size?: number;
}) {
  const fraction = Math.max(0, Math.min(value / max, 1));
  const stroke = 5;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - fraction);

  return (
    <svg width={size} height={size} role="img" aria-label={label}>
      <circle cx={cx} cy={cy} r={r} stroke="#1F2A37" strokeWidth={stroke} fill="none" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#E5E7EB"
        fontSize={size * 0.2}
        fontWeight={600}
      >
        {label}
      </text>
    </svg>
  );
}