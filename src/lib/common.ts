export const clearScreen = () => {
  process.stdout.write("\u001B[2J\u001B[H");
};
