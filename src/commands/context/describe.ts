import { Command, Args, Flags } from "@oclif/core";
import { api } from "../../lib/api.js";
import { printJSON } from "../../lib/format.js";

const PAAS = "darkube";

export default class ContextDescribe extends Command {
  static description = "Show deploy context details";
  static args = { context: Args.string({ description: "Context name or ID", required: true }) };
  static flags = { json: Flags.boolean({ description: "JSON output" }) };

  async run() {
    const { args, flags } = await this.parse(ContextDescribe);
    const res = await api<{ results: Array<Record<string, unknown>> }>(`/api/v1/${PAAS}/deploy_contexts/`);
    const ctx = res.results.find((c) => c.id === args.context || c.name === args.context);
    if (!ctx) {
      const direct = await api<Record<string, unknown>>(`/api/v1/${PAAS}/deploy_contexts/${args.context}/`);
      if (flags.json) { this.log(printJSON(direct)); return; }
      this.log(`Name:    ${direct.name}`);
      this.log(`ID:      ${direct.id}`);
      this.log(`Creator: ${direct.creator}`);
      this.log(`Redeploy: ${direct.redeploy_apps ? "yes" : "no"}`);
      return;
    }
    if (flags.json) { this.log(printJSON(ctx)); return; }
    this.log(`Name:    ${ctx.name}`);
    this.log(`ID:      ${ctx.id}`);
    this.log(`Creator: ${ctx.creator}`);
    this.log(`Redeploy: ${ctx.redeploy_apps ? "yes" : "no"}`);
    if (ctx.envs) {
      this.log("\nEnvironment Variables:");
      for (const e of ctx.envs as Array<{ key: string; value: string }>) {
        this.log(`  ${e.key}=${e.value}`);
      }
    }
  }
}
