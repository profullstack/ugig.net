import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["coverage/**", "cli/dist/**"],
  },
  {
    // eslint-config-next 16.4 turned these React Compiler rules on as errors.
    // 27 existing effects trip them; keep them visible as warnings until
    // those components are refactored.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default eslintConfig;
