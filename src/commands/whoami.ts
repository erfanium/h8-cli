import { Command, Flags } from "@oclif/core";
import { api } from "../lib/api.js";
import { printJSON } from "../lib/format.js";
import chalk from "chalk";

interface Organization {
  id: number;
  name: string;
  description: string;
  balance: number;
  current_user_roles: string[];
}

interface Profile {
  id: number;
  email: string;
  full_name: string;
  is_email_verified: boolean;
  is_verified: boolean;
  mobile: string;
  creation_time: string;
  organizations: Organization[];
}

export default class Whoami extends Command {
  static description = "Show current user info";
  static flags = { json: Flags.boolean({ description: "JSON output" }) };

  async run() {
    const { flags } = await this.parse(Whoami);
    const profile = await api<Profile>("/api/v2/users/profile");

    if (flags.json) { this.log(printJSON(profile)); return; }

    const check = (v: boolean) => v ? chalk.green("✓") : chalk.red("✕");

    this.log(`Email:       ${profile.email}`);
    this.log(`Name:        ${profile.full_name || "-"}`);
    this.log(`Phone:       ${profile.mobile || "-"}`);
    this.log(`Verified:    ${check(profile.is_verified)}`);
    this.log(`Email verif: ${check(profile.is_email_verified)}`);
    this.log(`Created:     ${profile.creation_time}`);
    this.log("");

    for (const org of profile.organizations) {
      const balance = org.balance?.toLocaleString() ?? "0";
      this.log(`${org.name}`);
      this.log(`  Roles:      ${org.current_user_roles?.join(", ") || "-"}`);
      this.log(`  Balance:    ${balance} IRT`);
    }
  }
}
