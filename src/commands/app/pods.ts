import { Command, Args, Flags } from "@oclif/core";
import { getConfig } from "../../lib/config.js";
import { resolveAppId } from "../../lib/helpers.js";
import { printJSON } from "../../lib/format.js";
import chalk from "chalk";
import Table from "cli-table3";

const empty = { top: "", "top-mid": "", "top-left": "", "top-right": "", bottom: "", "bottom-mid": "", "bottom-left": "", "bottom-right": "", left: "", "left-mid": "", mid: "", "mid-mid": "", right: "", "right-mid": "", middle: " " };

export default class AppPods extends Command {
  static description = "List pods of an app";
  static args = { app: Args.string({ description: "App name or ID", required: true }) };
  static flags = { json: Flags.boolean({ description: "JSON output" }) };

  async run() {
    const { args, flags } = await this.parse(AppPods);
    const appId = await resolveAppId(args.app);
    const config = getConfig();
    const org = config.organization || process.env.H8_ORGANIZATION || "";
    if (!org) throw new Error("H8_ORGANIZATION not set.");

    const ws = new WebSocket(
      `wss://api.hamravesh.com/ws/app-pods/?app_id=${appId}`,
      ["json", config.api_key, org],
    );

    return new Promise<void>((resolve, reject) => {
      let allPods: Array<Record<string, unknown>> = [];
      let debounce: ReturnType<typeof setTimeout> | null = null;
      let resolved = false;

      function done() {
        if (resolved) return;
        resolved = true;
        ws.close();
      }

      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data as string);
          const pods = d.data as Array<Record<string, unknown>> ?? [];
          let changed = false;
          for (const p of pods) {
            const idx = allPods.findIndex((x) => x.pod_name === p.pod_name);
            if (idx >= 0) {
              const prev = JSON.stringify(allPods[idx]);
              const cur = JSON.stringify(p);
              if (prev !== cur) { allPods[idx] = p; changed = true; }
            } else {
              allPods.push(p);
              changed = true;
            }
          }
          if (changed) {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => done(), 800);
          }
        } catch {}
      };

      ws.onerror = () => { if (debounce) clearTimeout(debounce); reject(new Error("WebSocket connection failed")); };

      ws.onclose = () => {
        if (debounce) clearTimeout(debounce);
        if (allPods.length === 0) { resolve(); return; }

        if (flags.json) { this.log(printJSON(allPods)); resolve(); return; }

        const table = new Table({
          head: ["POD", "READY", "PHASE", "STATUS", "RESTARTS", "CONTAINERS"],
          chars: empty,
          style: { "padding-left": 0, "padding-right": 1 },
        });

        for (const p of allPods) {
          const ready = p.is_ready ? chalk.green("●") : chalk.red("✕");
          const status = p.state_type ?? "";
          const containers = p.containers as Array<Record<string, unknown>> ?? [];
          table.push([
            p.pod_name as string ?? "",
            ready,
            p.phase as string ?? "",
            (p.is_terminating ? chalk.red(status + " (terminating)") : chalk.green(status)) as string,
            String(containers.reduce((s, c) => s + (c.restart_count as number ?? 0), 0)),
            containers.map((c) => c.name).join(", "),
          ]);
        }

        this.log(table.toString());
        resolve();
      };
    });
  }
}
