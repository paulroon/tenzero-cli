import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Alert, TextInput } from "@inkjs/ui";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import {
  saveConfig,
  syncProjects,
  DEFAULT_EDITOR,
  type TzConfig,
} from "@/lib/config";
import WelcomeScreen from "@/ui/components/WelcomeScreen";

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
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(!initialConfig);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [projectDirError, setProjectDirError] = useState<string | null>(null);
  const [projectDirResolved, setProjectDirResolved] = useState<string | null>(
    null
  );

  const handleNameSubmit = (value: string) => {
    setName(value.trim());
  };

  const handleEmailSubmit = (value: string) => {
    setEmail(value.trim());
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

    if (isEditMode) {
      setProjectDirResolved(resolvedPath);
      return;
    }

    const config = syncProjects({
      name: name!,
      email: email ?? "",
      projectDirectory: resolvedPath,
      projects: [],
      editor: DEFAULT_EDITOR,
      allowShellSyntax: false,
    });
    saveConfig(config);
    onComplete(config);
  };

  const handleEditorSubmit = (value: string) => {
    const editorCmd = value.trim() || DEFAULT_EDITOR;
    const config = syncProjects({
      ...initialConfig!,
      name: name!,
      email: email ?? "",
      projectDirectory: projectDirResolved!,
      editor: editorCmd,
    });
    saveConfig(config);
    onComplete(config);
  };

  const isEditMode = !!initialConfig;
  const showEditorStep = isEditMode && projectDirResolved !== null;

  useInput(
    (_input, key) => {
      if (key.return) {
        setShowWelcomeScreen(false);
      }
    },
    { isActive: showWelcomeScreen }
  );

  if (showWelcomeScreen) {
    return <WelcomeScreen />;
  }

  if (name === null && !initialConfig) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">Welcome to TenZero CLI</Text>
        <Text>No config found. Please enter your name:</Text>
        <Box marginTop={1}>
          <TextInput
            key="name"
            placeholder="Your name"
            onSubmit={handleNameSubmit}
          />
        </Box>
      </Box>
    );
  }

  if (name === null) {
    return (
      <Box flexDirection="column" padding={1}>
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
      </Box>
    );
  }

  if (email === null) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">
          {isEditMode ? "Edit Config" : "Welcome to TenZero CLI"}
        </Text>
        <Text>Enter your email:</Text>
        <Box marginTop={1}>
          <TextInput
            key="email"
            defaultValue={initialConfig?.email}
            placeholder="you@example.com"
            onSubmit={handleEmailSubmit}
          />
        </Box>
      </Box>
    );
  }

  if (showEditorStep) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">Edit Config</Text>
        <Text>Editor command to open projects (e.g. cursor, code):</Text>
        <Box marginTop={1}>
          <TextInput
            key="editor"
            defaultValue={initialConfig?.editor || DEFAULT_EDITOR}
            placeholder={DEFAULT_EDITOR}
            onSubmit={handleEditorSubmit}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
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
    </Box>
  );
}
