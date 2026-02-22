import React from "react";
import { render } from "ink";
import App from "@/ui/App";
import { setInkInstance } from "@/lib/inkInstance";
import { maybeRunDeploymentsCommand } from "@/lib/deployments/commands";

const argv = process.argv.slice(2);
const commandResult = await maybeRunDeploymentsCommand(argv);

if (commandResult.handled) {
  process.exit(commandResult.exitCode);
}

const instance = render(<App />);
setInkInstance(instance);
