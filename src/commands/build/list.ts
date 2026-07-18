import { Command, Args, Flags } from "@oclif/core";
import { api } from "../../lib/api.js";
import { printTable, printJSON } from "../../lib/format.js";
import { resolveAppId } from "../../lib/helpers.js";

const PAAS = "darkube";

export default class BuildList extends Command {
  static description = "List builds for an app";
  static args = { app: Args.string({ description: "App name or ID", required: true }) };
  static flags = {
    json: Flags.boolean({ description: "JSON output" }),
    limit: Flags.integer({ description: "Max results", default: 20 }),
  };

  async run() {
    const { args, flags } = await this.parse(BuildList);
    const appId = await resolveAppId(args.app);
    const res = await api<{ results: Record<string, unknown>[] }>(
      `/api/v1/${PAAS}/build/app/${appId}/?limit=${flags.limit}&offset=0`,
    );
    if (flags.json) { this.log(printJSON(res.results)); return; }
    this.log(printTable(res.results,
      ["BUILD ID", "STATE", "COMMIT", "BRANCH", "STARTED"],
      [
        (r) => (r.id as string) ?? "",
        (r) => (r.state as string) ?? "",
        (r) => ((r.commit as string) ?? "").slice(0, 8),
        (r) => (r.branch as string) ?? "",
        (r) => (r.start_time as string) ?? "",
      ],
    ));
  }
}
