import { Command, Args, Flags } from "@oclif/core";
import { saveConfig } from "../lib/config.js";

export default class Login extends Command {
  static description = "Save API key";
  static args = { key: Args.string({ description: "API key", required: true }) };
  static flags = { org: Flags.string({ description: "Organization name", char: "o" }) };

  async run() {
    const { args, flags } = await this.parse(Login);
    const org = flags.org || "";
    saveConfig({ api_key: args.key, organization: org, base_url: "https://api.hamravesh.com" });
    this.log(`Saved API key.${org ? ` Org: ${org}` : " Set org with --org or H8_ORGANIZATION env var."}`);
  }
}
