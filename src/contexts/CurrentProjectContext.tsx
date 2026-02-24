import {
    createContext,
    useContext,
    useState,
    useEffect,
    type ReactNode,
} from "react";
import { loadProjectConfig, type TzProjectConfig } from "@/lib/config";
import { consumeResumeProjectPath } from "@/lib/resumeState";

type CurrentProjectContextValue = {
    currentProject: TzProjectConfig | null;
    setCurrentProjectFromPath: (path: string) => void;
    clearCurrentProject: () => void;
};

const CurrentProjectContext = createContext<CurrentProjectContextValue | null>(
    null
);

export function CurrentProjectProvider({ children }: { children: ReactNode }) {
    const [currentProject, setCurrentProject] =
        useState<TzProjectConfig | null>(null);

    useEffect(() => {
        const path = consumeResumeProjectPath();
        if (path) {
            const config = loadProjectConfig(path);
            if (config) {
                setCurrentProject(config);
            } else {
                setCurrentProject({
                    name: path.split(/[/\\]/).pop() ?? "unknown",
                    path,
                    type: "other",
                });
            }
        }
    }, []);

    const setCurrentProjectFromPath = (path: string) => {
        const config = loadProjectConfig(path);
        if (config) {
            setCurrentProject(config);
        } else {
            setCurrentProject({
                name: path.split(/[/\\]/).pop() ?? "unknown",
                path,
                type: "other",
            });
        }
    };

    const clearCurrentProject = () => setCurrentProject(null);

    return (
        <CurrentProjectContext.Provider
            value={{
                currentProject,
                setCurrentProjectFromPath,
                clearCurrentProject,
            }}
        >
            {children}
        </CurrentProjectContext.Provider>
    );
}

export function useCurrentProject() {
    const ctx = useContext(CurrentProjectContext);
    return (
        ctx ?? {
            currentProject: null,
            setCurrentProjectFromPath: () => {},
            clearCurrentProject: () => {},
        }
    );
}
