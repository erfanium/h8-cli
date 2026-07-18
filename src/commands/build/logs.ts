import { Command, Args, Flags } from "@oclif/core";
import { api } from "../../lib/api.js";
import { printJSON, printKV } from "../../lib/format.js";

const PAAS = "darkube";

export default class BuildLogs extends Command {
  static description = "Show build details";
  static args = { buildId: Args.string({ description: "Build ID", required: true }) };
  static flags = { json: Flags.boolean({ description: "JSON output" }) };

  async run() {
    const { args, flags } = await this.parse(BuildLogs);
    const build = await api<Record<string, unknown>>(`/api/v1/${PAAS}/build/${args.buildId}/`);
    if (flags.json) { this.log(printJSON(build)); return; }
    this.log(printKV([
      ["Build ID", String(build.id ?? "")],
      ["State", String(build.state ?? "")],
      ["Commit", String(build.commit ?? "")],
      ["Branch", String(build.branch ?? "")],
      ["Started", String(build.start_time ?? "")],
      ["Ended", String(build.end_time || "-")],
    ]));
  }
}
