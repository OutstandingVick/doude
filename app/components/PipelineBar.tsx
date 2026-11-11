export function PipelineBar({
  locationM,
  uncertaintyM,
  lengthM = 20000,
}: {
  locationM: number;
  uncertaintyM: number;
  lengthM?: number;
}) {
  const position = (locationM / lengthM) * 100;
  const halfBand = (uncertaintyM / lengthM) * 100;

  return (
    <div className="w-28">
      <div className="relative h-1.5 rounded-full bg-surface2">
        <div
          className="absolute h-full rounded-full bg-warn/40"
          style={{ left: `${position - halfBand}%`, width: `${halfBand * 2}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-danger"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted">
        <span>0</span>
        <span>{lengthM / 1000} km</span>
      </div>
    </div>
  );
}