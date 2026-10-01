// Per-icon subpaths ship without declarations; they share the barrel's type.
declare module "@tabler/icons-react-native/*" {
  const Icon: import("@tabler/icons-react-native").Icon;
  export default Icon;
}
