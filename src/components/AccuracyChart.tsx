import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RoundRecord } from "@/lib/api";

const SERIES_COLORS = [
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

/** Accuracy per federated round, exactly as returned by the training API. */
export function AccuracyChart({ rounds }: { rounds: RoundRecord[] }) {
  if (!rounds.length) {
    return <p className="text-sm text-muted-foreground">No training history available yet.</p>;
  }

  const hospitals = Array.from(new Set(rounds.flatMap((r) => r.locals.map((l) => l.hospital))));

  const data = rounds.map((r) => {
    const row: Record<string, number | string | null> = {
      round: r.round,
      "Global model": r.globalAccuracy,
    };
    for (const h of hospitals) {
      row[h] = r.locals.find((l) => l.hospital === h)?.accuracy ?? null;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="round"
          tick={{ fontSize: 11 }}
          stroke="var(--color-muted-foreground)"
          label={{ value: "Round", position: "insideBottom", offset: -4, fontSize: 11 }}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="var(--color-muted-foreground)"
          domain={["auto", "auto"]}
          unit="%"
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--color-popover-foreground)",
          }}
          formatter={(v: number) => `${Number(v).toFixed(2)}%`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="Global model"
          stroke="var(--color-chart-1)"
          strokeWidth={2.5}
          dot={false}
          connectNulls
        />
        {hospitals.map((h, i) => (
          <Line
            key={h}
            type="monotone"
            dataKey={h}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
