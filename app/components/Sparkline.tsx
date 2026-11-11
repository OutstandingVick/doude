export function Sparkline({
  data,
  color = "#14B8A6",
  width = 96,
  height = 36,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length === 0) {
    return <div style={{ width, height }} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const barWidth = width / data.length;

  return (
    <svg width={width} height={height} role="img" aria-label="sparkline">
      {data.map((value, i) => {
        const h = ((value - min) / range) * (height - 3) + 2;
        return (
          <rect
            key={i}
            x={i * barWidth}
            y={height - h}
            width={Math.max(barWidth - 1, 1)}
            height={h}
            fill={color}
            opacity={0.75}
          />
        );
      })}
    </svg>
  );
}