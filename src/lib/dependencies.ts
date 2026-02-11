/** Check if a command exists by running it with optional args (exit code 0 = exists) */
export async function isCommandInstalled(
  cmd: string,
  args: string[] = ["version"]
): Promise<boolean> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

const NODESOURCE = [
  "Linux/macOS:       curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
  "                   apt-get install -y nodejs",
];

function brewInstructions(
  installLine: string,
  url: string,
  brewPkg: string
): readonly string[] {
  return [
    `${installLine}: ${url}`,
    "",
    `macOS (Homebrew):  brew install ${brewPkg}`,
    ...NODESOURCE,
  ];
}

const DEPENDENCIES = [
  {
    name: "node",
    command: "node",
    checkArgs: ["--version"] as const,
    instructions: brewInstructions("Install Node.js", "nodejs.org/en/download/", "node"),
  },
  {
    name: "npm",
    command: "npm",
    checkArgs: ["--version"] as const,
    instructions: brewInstructions("Install npm", "npmjs.com/get-npm", "npm"),
  },
  {
    name: "yarn",
    command: "yarn",
    checkArgs: ["--version"] as const,
    instructions: brewInstructions("Install Yarn", "yarnpkg.com/getting-started/install", "yarn"),
  },
  {
    name: "pnpm",
    command: "pnpm",
    checkArgs: ["--version"] as const,
    instructions: brewInstructions("Install pnpm", "pnpmjs.com/installation", "pnpm"),
  },
  {
    name: "bun",
    command: "bun",
    checkArgs: ["--version"] as const,
    instructions: brewInstructions("Install Bun", "bun.sh/install", "bun"),
  },
];

export const getDependencyStatus = async () => {
  return Promise.all(
    DEPENDENCIES.map(async ({ name, command, checkArgs, instructions }) => ({
      name,
      installed: await isCommandInstalled(command, [...checkArgs]),
      instructions,
    }))
  );
};
