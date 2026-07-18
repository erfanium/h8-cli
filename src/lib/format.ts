import Table from "cli-table3";
import chalk from "chalk";

export function printTable(
  rows: Record<string, unknown>[],
  head: string[],
  accessors: Array<(row: Record<string, unknown>) => string>,
): string {
  if (rows.length === 0) return "No resources found.";

  const table = new Table({
    head,
    chars: {
      top: "", "top-mid": "", "top-left": "", "top-right": "",
      bottom: "", "bottom-mid": "", "bottom-left": "", "bottom-right": "",
      left: "", "left-mid": "", mid: "", "mid-mid": "",
      right: "", "right-mid": "", middle: " ",
    },
    style: { "padding-left": 0, "padding-right": 1 },
    wordWrap: false,
  });

  for (const row of rows) {
    table.push(accessors.map((fn) => fn(row)));
  }

  return table.toString();
}

export function stateIcon(state: Record<string, unknown>): string {
  const t = state.state_type as string;
  return {
    healthy: chalk.green("●"),
    deploying: chalk.yellow("◐"),
    failed: chalk.red("✕"),
    stopped: chalk.gray("○"),
    building: chalk.blue("◉"),
    not_ready: chalk.yellow("◐"),
    initializing: chalk.yellow("◐"),
    inaccessible: chalk.red("✕"),
  }[t] ?? "?";
}

export function printJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function printKV(pairs: [string, string][]): string {
  const maxKey = Math.max(...pairs.map(([k]) => k.length));
  return pairs.map(([key, value]) => `${key.padEnd(maxKey + 2)}${value}`).join("\n");
}
