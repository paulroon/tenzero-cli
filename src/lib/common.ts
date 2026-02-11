export const clearScreen = () => {
  process.stdout.write("\u001B[2J\u001B[H");
};

export const wait = (seconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));
