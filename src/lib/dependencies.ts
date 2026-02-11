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

export const SYMFONY_INSTALL_INSTRUCTIONS = [
  "Install the Symfony CLI: symfony.com/download",
  "",
  "macOS (Homebrew):  brew install symfony-cli/tap/symfony-cli",
  "Linux/macOS:       curl -sS https://get.symfony.com/cli/installer | bash",
];

const NODE_INSTALL_INSTRUCTIONS = [
  "Install Node.js: nodejs.org/en/download/",
  "",
  "macOS (Homebrew):  brew install node",
  "Linux/macOS:       curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
  "                   apt-get install -y nodejs",
];

const NPM_INSTALL_INSTRUCTIONS = [
  "Install npm: npmjs.com/get-npm",
  "",
  "macOS (Homebrew):  brew install npm",
  "Linux/macOS:       curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
  "                   apt-get install -y nodejs",
];

const YARN_INSTALL_INSTRUCTIONS = [
  "Install Yarn: yarnpkg.com/getting-started/install",
  "",
  "macOS (Homebrew):  brew install yarn",
  "Linux/macOS:       curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
  "                   apt-get install -y nodejs",
];

const PNPM_INSTALL_INSTRUCTIONS = [
  "Install pnpm: pnpmjs.com/installation",
  "",
  "macOS (Homebrew):  brew install pnpm",
  "Linux/macOS:       curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
  "                   apt-get install -y nodejs",
];

const BUN_INSTALL_INSTRUCTIONS = [
  "Install Bun: bun.sh/install",
  "",
  "macOS (Homebrew):  brew install bun",
  "Linux/macOS:       curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
  "                   apt-get install -y nodejs",
];

const DEPENDENCIES = [
  {
    name: "symfony",
    command: "symfony",
    checkArgs: ["version"],
    instructions: SYMFONY_INSTALL_INSTRUCTIONS,
  },
  {
    name: "node",
    command: "node",
    checkArgs: ["--version"],
    instructions: NODE_INSTALL_INSTRUCTIONS,
  },
  {
    name: "npm",
    command: "npm",
    checkArgs: ["--version"],
    instructions: NPM_INSTALL_INSTRUCTIONS,
  },
  {
    name: "yarn",
    command: "yarn",
    checkArgs: ["--version"],
    instructions: YARN_INSTALL_INSTRUCTIONS,
  },
  {
    name: "pnpm",
    command: "pnpm",
    checkArgs: ["--version"],
    instructions: PNPM_INSTALL_INSTRUCTIONS,
  },
  {
    name: "bun",
    command: "bun",
    checkArgs: ["--version"],
    instructions: BUN_INSTALL_INSTRUCTIONS,
  },
];

export const getDependencyStatus = async () => {
  return Promise.all(
    DEPENDENCIES.map(async ({ name, command, checkArgs, instructions }) => ({
      name,
      installed: await isCommandInstalled(command, checkArgs),
      instructions,
    }))
  );
};
