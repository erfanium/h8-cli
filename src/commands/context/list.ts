import { Command, Flags } from "@oclif/core";
import { api } from "../../lib/api.js";
import { printTable, printJSON } from "../../lib/format.js";

const PAAS = "darkube";

export default class ContextList extends Command {
  static description = "List deploy contexts";
  static flags = { json: Flags.boolean({ description: "JSON output" }) };

  async run() {
    const { flags } = await this.parse(ContextList);
    const res = await api<{ results: Record<string, unknown>[] }>(`/api/v1/${PAAS}/deploy_contexts/`);
    if (flags.json) { this.log(printJSON(res.results)); return; }
    this.log(printTable(res.results,
      ["NAME", "ID", "REBUILD", "ENVS"],
      [
        (r) => (r.name as string) ?? "",
        (r) => (r.id as string) ?? "",
        (r) => (r.redeploy_apps ? "yes" : "no"),
        (r) => String((r.envs as Array<unknown>)?.length ?? 0),
      ],
    ));
  }
}
