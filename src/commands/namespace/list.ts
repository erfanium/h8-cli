import { Command, Flags } from "@oclif/core";
import { api } from "../../lib/api.js";
import { printTable, printJSON } from "../../lib/format.js";

const PAAS = "darkube";

export default class NamespaceList extends Command {
  static description = "List namespaces";
  static flags = { json: Flags.boolean({ description: "JSON output" }) };

  async run() {
    const { flags } = await this.parse(NamespaceList);
    const ns = await api<{ results: Array<Record<string, unknown>> }>(
      `/api/v1/${PAAS}/namespaces/`,
    );
    const results = ns.results ?? (ns as unknown as Array<Record<string, unknown>>);
    if (flags.json) { this.log(printJSON(results)); return; }
    this.log(printTable(results,
      ["NAME", "ID", "CLUSTER"],
      [
        (r) => (r.name as string) ?? "",
        (r) => String(r.id ?? ""),
        (r) => {
          const c = r.cluster;
          if (typeof c === "object" && c) return ((c as Record<string, unknown>).name as string) ?? "";
          return String(c ?? "");
        },
      ],
    ));
  }
}
