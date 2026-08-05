import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Concourse",
  description: "Documentation for Concourse, a plugin-based game library client",
  cleanUrls: true,
  // This is a project site, served from https://smh0505.github.io/Concourse/, not a user/org
  // site at the domain root - without this, every generated absolute link/asset path (nav,
  // sidebar, internal page links) assumes root ("/") and 404s once actually deployed.
  base: "/Concourse/",

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "User Guide", link: "/guide/" },
      { text: "Plugin Docs", link: "/plugins/" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "User Guide",
          items: [
            { text: "Getting Started", link: "/guide/" },
            { text: "Library & Games", link: "/guide/library" },
            { text: "Plugins & Themes", link: "/guide/plugins-and-themes" },
            { text: "Big Picture Mode", link: "/guide/big-picture" },
          ],
        },
      ],
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
