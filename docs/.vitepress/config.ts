import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Concourse",
  description: "Documentation for Concourse's plugin system",
  cleanUrls: true,

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Plugin Docs", link: "/plugins/" },
    ],

    sidebar: {
      "/plugins/": [
        {
          text: "Plugin Development",
          items: [
            { text: "Architecture Overview", link: "/plugins/" },
            { text: "Getting Started", link: "/plugins/getting-started" },
            { text: "Manifest Reference", link: "/plugins/manifest-reference" },
            { text: "WIT Interface", link: "/plugins/wit-interface" },
            { text: "Security Model", link: "/plugins/security-model" },
            { text: "Publishing", link: "/plugins/publishing" },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/smh0505/Concourse" }],

    search: {
      provider: "local",
    },
  },
});
