export type DependencyCatalogEntry = {
    id: string;
    name: string;
    command: string;
    checkArgs: readonly string[];
    instructions: readonly string[];
};

const NODESOURCE = [
    "Linux/macOS:       curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
    "                   apt-get install -y nodejs",
] as const;

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

export const DEPENDENCY_CATALOG: Record<string, DependencyCatalogEntry> = {
    "symfony-cli": {
        id: "symfony-cli",
        name: "symfony CLI",
        command: "symfony",
        checkArgs: ["version"],
        instructions: [
            "Install the Symfony CLI: symfony.com/download",
            "",
            "macOS (Homebrew):  brew install symfony-cli/tap/symfony-cli",
            "Linux/macOS:       curl -sS https://get.symfony.com/cli/installer | bash",
        ],
    },
    composer: {
        id: "composer",
        name: "composer",
        command: "composer",
        checkArgs: ["--version"],
        instructions: [
            "Install Composer: getcomposer.org/download/",
            "",
            "macOS (Homebrew):  brew install composer",
            "Linux/macOS:       php -r \"copy('https://getcomposer.org/installer', 'composer-setup.php');\"",
        ],
    },
    node: {
        id: "node",
        name: "node",
        command: "node",
        checkArgs: ["--version"],
        instructions: brewInstructions(
            "Install Node.js",
            "nodejs.org/en/download/",
            "node"
        ),
    },
    npm: {
        id: "npm",
        name: "npm",
        command: "npm",
        checkArgs: ["--version"],
        instructions: brewInstructions(
            "Install npm",
            "npmjs.com/get-npm",
            "npm"
        ),
    },
    yarn: {
        id: "yarn",
        name: "yarn",
        command: "yarn",
        checkArgs: ["--version"],
        instructions: brewInstructions(
            "Install Yarn",
            "yarnpkg.com/getting-started/install",
            "yarn"
        ),
    },
    pnpm: {
        id: "pnpm",
        name: "pnpm",
        command: "pnpm",
        checkArgs: ["--version"],
        instructions: brewInstructions(
            "Install pnpm",
            "pnpmjs.com/installation",
            "pnpm"
        ),
    },
    bun: {
        id: "bun",
        name: "bun",
        command: "bun",
        checkArgs: ["--version"],
        instructions: brewInstructions("Install Bun", "bun.sh/install", "bun"),
    },
    docker: {
        id: "docker",
        name: "docker",
        command: "docker",
        checkArgs: ["--version"],
        instructions: [
            "Install Docker Desktop: docs.docker.com/get-started/get-docker/",
            "",
            "macOS (Homebrew):  brew install --cask docker",
        ],
    },
    make: {
        id: "make",
        name: "make",
        command: "make",
        checkArgs: ["--version"],
        instructions: [
            "Install GNU Make",
            "",
            "macOS (Xcode tools): xcode-select --install",
            "macOS (Homebrew):    brew install make",
        ],
    },
    "not-here": {
        id: "not-here",
        name: "not-here",
        command: "not-here",
        checkArgs: ["--version"],
        instructions: [
            "Test dependency: this command does not exist by default.",
            "Remove 'not-here' from template dependencies when done testing.",
        ],
    },
};
