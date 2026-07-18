import { Command, Args } from "@oclif/core";
import { resolveAppId, getWritable, putAppConfig } from "../../lib/helpers.js";

export default class SetReplicas extends Command {
  static description = "Scale an app";
  static args = {
    app: Args.string({ description: "App name or ID", required: true }),
    count: Args.integer({ description: "Number of replicas", required: true }),
  };

  async run() {
    const { args } = await this.parse(SetReplicas);
    const appId = await resolveAppId(args.app);
    const config = await getWritable(appId);
    const count = args.count;
    if (typeof count !== "number" || !isFinite(count)) throw new Error("Count must be a number");
    const old = config.replicas;
    config.replicas = count;
    await putAppConfig(appId, config);
    this.log(`Scaled "${args.app}": ${old} -> ${count} replicas`);
  }
}
