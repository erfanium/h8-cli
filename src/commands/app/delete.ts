import { Command, Args } from "@oclif/core";
import { api } from "../../lib/api.js";

const PAAS = "darkube";

async function resolve(name: string): Promise<string> {
  if (name.includes("-") && name.length > 30) return name;
  const res = await api<{ results: Array<{ id: string; name: string }> }>(
    `/api/v2/${PAAS}/apps/?limit=500&offset=0&fields=id,name`,
  );
  const m = res.results.find((a) => a.name === name || a.id === name);
  if (!m) throw new Error(`App "${name}" not found`);
  return m.id;
}

export default class AppDelete extends Command {
  static description = "Delete an app";
  static args = { app: Args.string({ description: "App name or ID", required: true }) };
  async run() {
    const { args } = await this.parse(AppDelete);
    const appId = await resolve(args.app);
    await api(`/api/v1/${PAAS}/apps/${appId}/`, { method: "DELETE" });
    this.log(`Deleted "${args.app}".`);
  }
}
