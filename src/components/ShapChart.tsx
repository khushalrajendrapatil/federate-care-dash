import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ShapItem } from "@/lib/api";

/**
 * Horizontal SHAP contribution chart with a plain-language legend, so a
 * non-technical viewer can read which factors drive the risk score.
 */
export function ShapChart({ items, limit = 10 }: { items: ShapItem[]; limit?: number }) {
  const data = [...items]
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, limit)
    .reverse();

  if (!data.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No explanation data was returned for this prediction.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm bg-risk-high" />
          Features pushing toward <strong>higher risk</strong>
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm bg-risk-low" />
          Features pushing toward <strong>lower risk</strong>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
          <YAxis
            type="category"
            dataKey="feature"
            width={150}
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted-foreground)"
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)" }}
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-popover-foreground)",
            }}
            formatter={(value: number) => [
              `${value > 0 ? "+" : ""}${value.toFixed(4)}`,
              value > 0 ? "Raises risk" : "Lowers risk",
            ]}
          />
          <Bar dataKey="impact" radius={3}>
            {data.map((d) => (
              <Cell
                key={d.feature}
                fill={d.impact >= 0 ? "var(--color-risk-high)" : "var(--color-risk-low)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
