import { Command, Args, Flags } from "@oclif/core";
import { api } from "../../lib/api.js";
import { printJSON } from "../../lib/format.js";
import { resolveAppId } from "../../lib/helpers.js";

const PAAS = "darkube";

export default class AppLogs extends Command {
  static description = "Show app logs";
  static args = { app: Args.string({ description: "App name or ID", required: true }) };
  static flags = {
    json: Flags.boolean({ description: "JSON output" }),
    tail: Flags.integer({ description: "Lines to fetch", default: 100 }),
  };

  async run() {
    const { args, flags } = await this.parse(AppLogs);
    const appId = await resolveAppId(args.app);
    const containers = await api<Record<string, string[]>>(
      `/api/v1/${PAAS}/apps/${appId}/app_containers/`,
    );
    const entries = Object.entries(containers ?? {});
    if (entries.length === 0) { this.log("No containers found."); return; }
    const [pod_name, container_names] = entries[0];
    const container_name = container_names[0];

    const data = await api<{ logs: Record<string, string>; reference: number }>(
      `/api/v1/${PAAS}/apps/${appId}/app_log/?from_index=0&to_index=${flags.tail}&reference_index=0&pod_name=${pod_name}&container_name=${container_name}&previous=false`,
    );
    if (flags.json) { this.log(printJSON(data)); return; }
    for (const [ts, line] of Object.entries(data.logs ?? {})) {
      this.log(`${ts} ${line}`);
    }
  }
}
