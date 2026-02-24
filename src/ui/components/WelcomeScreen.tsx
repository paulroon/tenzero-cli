import { Box, Text } from "ink";

type Props = {
    onContinueHint?: string;
};

export default function WelcomeScreen({
    onContinueHint = "Press <enter> to continue.",
}: Props) {
    return (
        <Box
            flexDirection="column"
            flexGrow={1}
            justifyContent="center"
            alignItems="center"
        >
            <Box flexDirection="column" alignItems="center">
                <Text color="yellow" bold>
                    TenZero
                </Text>
                <Text>Your App Lifecycle Helper</Text>
                <Box marginTop={1}>
                    <Text dimColor>
                        tz is a command line tool that will help you to scaffold
                        new applications from prefabricated templates into a
                        development environment in seconds. You can manage their
                        different environments with the cloud provider of your
                        choice, spin up, take down or release a new version all
                        from one place.
                    </Text>
                </Box>
                <Box marginTop={1}>
                    <Text>
                        First we need some information about you, the developer.
                    </Text>
                </Box>
                <Box marginTop={1}>
                    <Text>{onContinueHint}</Text>
                </Box>
            </Box>
        </Box>
    );
}
