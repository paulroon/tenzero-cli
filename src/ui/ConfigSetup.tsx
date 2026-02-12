import { useState } from "react";
import { Box, Text } from "ink";
import MenuBox from "@/ui/components/MenuBox";
import { Alert, TextInput } from "@inkjs/ui";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { saveConfig, syncProjects, type TzConfig } from "@/lib/config";

const DEFAULT_PROJECT_DIR = join(homedir(), "Projects");

function resolvePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("~")) {
    return join(homedir(), trimmed.slice(1).replace(/^[/\\]/, ""));
  }
  return resolve(trimmed);
}

function validateProjectDirectory(input: string): string | null {
  const path = resolvePath(input || DEFAULT_PROJECT_DIR);
  if (!existsSync(path)) {
    return `Directory does not exist: ${path}`;
  }
  if (!statSync(path).isDirectory()) {
    return `Path is not a directory: ${path}`;
  }
  return null;
}

type Props = {
  onComplete: (config: TzConfig) => void;
  initialConfig?: TzConfig;
};

export default function ConfigSetup({ onComplete, initialConfig }: Props) {
  const [name, setName] = useState<string | null>(null);
  const [projectDirError, setProjectDirError] = useState<string | null>(null);

  const handleNameSubmit = (value: string) => {
    setName(value.trim());
  };

  const handleProjectDirSubmit = async (value: string) => {
    const projectDirectory = value.trim() || DEFAULT_PROJECT_DIR;
    const error = validateProjectDirectory(projectDirectory);
    if (error) {
      setProjectDirError(error);
      return;
    }
    setProjectDirError(null);
    const resolvedPath = resolvePath(projectDirectory);

    const config = syncProjects({
      name: name!,
      projectDirectory: resolvedPath,
      projects: [],
    });
    saveConfig(config);
    onComplete(config);
  };

  const isEditMode = !!initialConfig;

  if (name === null && !initialConfig) {
    return (
      <MenuBox flexDirection="column" padding={1}>
        <Text color="yellow">Welcome to TenZero CLI</Text>
        <Text>No config found. Please enter your name:</Text>
        <Box marginTop={1}>
          <TextInput
            key="name"
            placeholder="Your name"
            onSubmit={handleNameSubmit}
          />
        </Box>
      </MenuBox>
    );
  }

  if (name === null) {
    return (
      <MenuBox flexDirection="column" padding={1}>
        <Text color="yellow">
          {isEditMode ? "Edit Config" : "Welcome to TenZero CLI"}
        </Text>
        <Text>Enter your name:</Text>
        <Box marginTop={1}>
          <TextInput
            key="name"
            defaultValue={initialConfig!.name}
            placeholder="Your name"
            onSubmit={handleNameSubmit}
          />
        </Box>
      </MenuBox>
    );
  }

  return (
    <MenuBox flexDirection="column" padding={1}>
      <Text color="yellow">
        {isEditMode ? "Edit Config" : "Welcome to TenZero CLI"}
      </Text>
      <Text>Enter project directory (where projects will be installed):</Text>
      <Box marginTop={1}>
        <TextInput
          key="project-directory"
          defaultValue={initialConfig?.projectDirectory}
          placeholder={DEFAULT_PROJECT_DIR}
          onSubmit={handleProjectDirSubmit}
        />
      </Box>
      {projectDirError && (
        <Box marginTop={1}>
          <Alert variant="error" title="Invalid directory">
            {projectDirError}
          </Alert>
        </Box>
      )}
    </MenuBox>
  );
}
