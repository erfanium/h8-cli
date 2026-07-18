import { Command, Args } from "@oclif/core";
import { resolveAppId, getWritable, putAppConfig } from "../../lib/helpers.js";

export default class SetEnv extends Command {
  static description = "Set environment variables on an app (merge)";
  static args = {
    app: Args.string({ description: "App name or ID", required: true }),
    pairs: Args.string({ description: "KEY=VALUE pairs", required: true, multiple: true }),
  };

  async run() {
    const { args } = await this.parse(SetEnv);
    const appId = await resolveAppId(args.app);
    const config = await getWritable(appId);

    const newEnvs: Array<{ name: string; value: string }> = [];
    for (const pair of args.pairs) {
      const eq = pair.indexOf("=");
      if (eq === -1) throw new Error(`Invalid env format: "${pair}". Use KEY=VALUE.`);
      newEnvs.push({ name: pair.slice(0, eq), value: pair.slice(eq + 1) });
    }

    const merged = new Map<string, string>();
    for (const e of config.envs ?? []) merged.set(e.name, e.value);
    for (const e of newEnvs) merged.set(e.name, e.value);
    config.envs = Array.from(merged, ([name, value]) => ({ name, value }));

    await putAppConfig(appId, config);
    this.log(`Updated envs on "${args.app}":`);
    for (const [k, v] of merged) {
      this.log(`  ${k}=${v}`);
    }
  }
}
