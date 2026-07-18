import { Command, Args, Flags } from "@oclif/core";
import { getConfig as getConfigRaw } from "../../lib/config.js";
import { resolveAppId } from "../../lib/helpers.js";
import { printJSON } from "../../lib/format.js";
import chalk from "chalk";

export default class AppEvents extends Command {
  static description = "Watch app deployment events (WebSocket)";
  static args = { app: Args.string({ description: "App name or ID", required: true }) };
  static flags = { json: Flags.boolean({ description: "JSON output" }) };

  async run() {
    const { args, flags } = await this.parse(AppEvents);
    const appId = await resolveAppId(args.app);
    const config = getConfigRaw();
    const org = config.organization || process.env.H8_ORGANIZATION || "";
    if (!org) throw new Error("H8_ORGANIZATION not set. WebSocket auth requires org name.");

    const ws = new WebSocket(
      `wss://api.hamravesh.com/ws/app-events/?app_id=${appId}`,
      ["json", config.api_key, org],
    );

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); resolve(); }, 15000);
      ws.onopen = () => this.log("Connected. Waiting for events...\n");
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data as string);
          const pods = d.data ?? {};
          for (const [pod, evts] of Object.entries(pods) as [string, Array<{ reason: string; message: string }>][]) {
            const last = evts[evts.length - 1];
            const bad = last.reason === "Failed" || last.reason.includes("Error") || last.reason.includes("BackOff");
            const icon = bad ? chalk.red("✕") : chalk.green("●");
            if (flags.json) {
              this.log(JSON.stringify({ pod, events: evts }));
            } else {
              this.log(`${icon} ${pod}  ${last.reason.padEnd(12)}  ${last.message.slice(0, 120)}`);
            }
          }
        } catch {}
      };
      ws.onerror = () => { clearTimeout(timer); reject(new Error("WebSocket connection failed")); };
      ws.onclose = () => { clearTimeout(timer); resolve(); };
    });
  }
}
