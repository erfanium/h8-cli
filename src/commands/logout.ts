import { Command } from "@oclif/core";
import { saveConfig } from "../lib/config.js";

export default class Logout extends Command {
  static description = "Clear saved credentials";
  async run() {
    saveConfig({ api_key: "", organization: "", base_url: "https://api.hamravesh.com" });
    this.log("Cleared credentials.");
  }
}
