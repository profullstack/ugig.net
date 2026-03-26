import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["coverage/**", "cli/dist/**"],
  },
];

export default eslintConfig;
