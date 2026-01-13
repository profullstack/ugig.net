import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["coverage/**"],
  },
];

export default eslintConfig;
