import { defineConfig } from "vitepress";

// English (root) themeConfig - nav/sidebar labels/links. Every other locale below defines its
// own translated copy of this same shape; VitePress merges each locale's `themeConfig` over the
// top-level one, so socialLinks/search (identical across locales) stay defined once at the
// bottom instead of being repeated per locale.
const enThemeConfig = {
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
          { text: "Official Plugins", link: "/guide/official-plugins" },
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
          { text: "Theme Manifests", link: "/plugins/theme-manifests" },
          { text: "WIT Interface", link: "/plugins/wit-interface" },
          { text: "Security Model", link: "/plugins/security-model" },
          { text: "Publishing", link: "/plugins/publishing" },
        ],
      },
    ],
  },
};

export default defineConfig({
  title: "Concourse",
  description: "Documentation for Concourse, a plugin-based game library client",
  cleanUrls: true,
  // This is a project site, served from https://smh0505.github.io/Concourse/, not a user/org
  // site at the domain root - without this, every generated absolute link/asset path (nav,
  // sidebar, internal page links) assumes root ("/") and 404s once actually deployed.
  base: "/Concourse/",

  // Machine-translated, same disclosed approach as the app's own 9 non-English UI locales
  // (Milestone 20) - mirrors that same locale set exactly (Milestone 22), one content
  // subdirectory per locale under `docs/`, VitePress's own locale switcher enabled automatically
  // once 2+ locales are declared here.
  locales: {
    root: { label: "English", lang: "en", themeConfig: enThemeConfig },
    ko: {
      label: "한국어",
      lang: "ko",
      link: "/ko/",
      themeConfig: {
        nav: [
          { text: "홈", link: "/ko/" },
          { text: "사용자 가이드", link: "/ko/guide/" },
          { text: "플러그인 문서", link: "/ko/plugins/" },
        ],
        sidebar: {
          "/ko/guide/": [
            {
              text: "사용자 가이드",
              items: [
                { text: "시작하기", link: "/ko/guide/" },
                { text: "라이브러리 & 게임", link: "/ko/guide/library" },
                { text: "플러그인 & 테마", link: "/ko/guide/plugins-and-themes" },
                { text: "공식 플러그인", link: "/ko/guide/official-plugins" },
                { text: "빅 픽처 모드", link: "/ko/guide/big-picture" },
              ],
            },
          ],
          "/ko/plugins/": [
            {
              text: "플러그인 개발",
              items: [
                { text: "아키텍처 개요", link: "/ko/plugins/" },
                { text: "시작하기", link: "/ko/plugins/getting-started" },
                { text: "매니페스트 참조", link: "/ko/plugins/manifest-reference" },
                { text: "테마 매니페스트", link: "/ko/plugins/theme-manifests" },
                { text: "WIT 인터페이스", link: "/ko/plugins/wit-interface" },
                { text: "보안 모델", link: "/ko/plugins/security-model" },
                { text: "배포", link: "/ko/plugins/publishing" },
              ],
            },
          ],
        },
      },
    },
    ja: {
      label: "日本語",
      lang: "ja",
      link: "/ja/",
      themeConfig: {
        nav: [
          { text: "ホーム", link: "/ja/" },
          { text: "ユーザーガイド", link: "/ja/guide/" },
          { text: "プラグインドキュメント", link: "/ja/plugins/" },
        ],
        sidebar: {
          "/ja/guide/": [
            {
              text: "ユーザーガイド",
              items: [
                { text: "はじめに", link: "/ja/guide/" },
                { text: "ライブラリとゲーム", link: "/ja/guide/library" },
                { text: "プラグインとテーマ", link: "/ja/guide/plugins-and-themes" },
                { text: "公式プラグイン", link: "/ja/guide/official-plugins" },
                { text: "ビッグピクチャーモード", link: "/ja/guide/big-picture" },
              ],
            },
          ],
          "/ja/plugins/": [
            {
              text: "プラグイン開発",
              items: [
                { text: "アーキテクチャ概要", link: "/ja/plugins/" },
                { text: "はじめに", link: "/ja/plugins/getting-started" },
                { text: "マニフェストリファレンス", link: "/ja/plugins/manifest-reference" },
                { text: "テーママニフェスト", link: "/ja/plugins/theme-manifests" },
                { text: "WIT インターフェース", link: "/ja/plugins/wit-interface" },
                { text: "セキュリティモデル", link: "/ja/plugins/security-model" },
                { text: "公開", link: "/ja/plugins/publishing" },
              ],
            },
          ],
        },
      },
    },
    "zh-hans": {
      label: "简体中文",
      lang: "zh-Hans",
      link: "/zh-hans/",
      themeConfig: {
        nav: [
          { text: "首页", link: "/zh-hans/" },
          { text: "用户指南", link: "/zh-hans/guide/" },
          { text: "插件文档", link: "/zh-hans/plugins/" },
        ],
        sidebar: {
          "/zh-hans/guide/": [
            {
              text: "用户指南",
              items: [
                { text: "快速开始", link: "/zh-hans/guide/" },
                { text: "游戏库与游戏", link: "/zh-hans/guide/library" },
                { text: "插件与主题", link: "/zh-hans/guide/plugins-and-themes" },
                { text: "官方插件", link: "/zh-hans/guide/official-plugins" },
                { text: "大屏幕模式", link: "/zh-hans/guide/big-picture" },
              ],
            },
          ],
          "/zh-hans/plugins/": [
            {
              text: "插件开发",
              items: [
                { text: "架构概览", link: "/zh-hans/plugins/" },
                { text: "快速开始", link: "/zh-hans/plugins/getting-started" },
                { text: "清单参考", link: "/zh-hans/plugins/manifest-reference" },
                { text: "主题清单", link: "/zh-hans/plugins/theme-manifests" },
                { text: "WIT 接口", link: "/zh-hans/plugins/wit-interface" },
                { text: "安全模型", link: "/zh-hans/plugins/security-model" },
                { text: "发布", link: "/zh-hans/plugins/publishing" },
              ],
            },
          ],
        },
      },
    },
    es: {
      label: "Español",
      lang: "es",
      link: "/es/",
      themeConfig: {
        nav: [
          { text: "Inicio", link: "/es/" },
          { text: "Guía de usuario", link: "/es/guide/" },
          { text: "Documentación de plugins", link: "/es/plugins/" },
        ],
        sidebar: {
          "/es/guide/": [
            {
              text: "Guía de usuario",
              items: [
                { text: "Primeros pasos", link: "/es/guide/" },
                { text: "Biblioteca y juegos", link: "/es/guide/library" },
                { text: "Plugins y temas", link: "/es/guide/plugins-and-themes" },
                { text: "Plugins oficiales", link: "/es/guide/official-plugins" },
                { text: "Modo Big Picture", link: "/es/guide/big-picture" },
              ],
            },
          ],
          "/es/plugins/": [
            {
              text: "Desarrollo de plugins",
              items: [
                { text: "Resumen de arquitectura", link: "/es/plugins/" },
                { text: "Primeros pasos", link: "/es/plugins/getting-started" },
                { text: "Referencia del manifiesto", link: "/es/plugins/manifest-reference" },
                { text: "Manifiestos de tema", link: "/es/plugins/theme-manifests" },
                { text: "Interfaz WIT", link: "/es/plugins/wit-interface" },
                { text: "Modelo de seguridad", link: "/es/plugins/security-model" },
                { text: "Publicación", link: "/es/plugins/publishing" },
              ],
            },
          ],
        },
      },
    },
    fr: {
      label: "Français",
      lang: "fr",
      link: "/fr/",
      themeConfig: {
        nav: [
          { text: "Accueil", link: "/fr/" },
          { text: "Guide utilisateur", link: "/fr/guide/" },
          { text: "Documentation des plugins", link: "/fr/plugins/" },
        ],
        sidebar: {
          "/fr/guide/": [
            {
              text: "Guide utilisateur",
              items: [
                { text: "Démarrage", link: "/fr/guide/" },
                { text: "Bibliothèque & jeux", link: "/fr/guide/library" },
                { text: "Plugins & thèmes", link: "/fr/guide/plugins-and-themes" },
                { text: "Plugins officiels", link: "/fr/guide/official-plugins" },
                { text: "Mode Big Picture", link: "/fr/guide/big-picture" },
              ],
            },
          ],
          "/fr/plugins/": [
            {
              text: "Développement de plugins",
              items: [
                { text: "Vue d'ensemble de l'architecture", link: "/fr/plugins/" },
                { text: "Démarrage", link: "/fr/plugins/getting-started" },
                { text: "Référence du manifeste", link: "/fr/plugins/manifest-reference" },
                { text: "Manifestes de thème", link: "/fr/plugins/theme-manifests" },
                { text: "Interface WIT", link: "/fr/plugins/wit-interface" },
                { text: "Modèle de sécurité", link: "/fr/plugins/security-model" },
                { text: "Publication", link: "/fr/plugins/publishing" },
              ],
            },
          ],
        },
      },
    },
    de: {
      label: "Deutsch",
      lang: "de",
      link: "/de/",
      themeConfig: {
        nav: [
          { text: "Start", link: "/de/" },
          { text: "Benutzerhandbuch", link: "/de/guide/" },
          { text: "Plugin-Dokumentation", link: "/de/plugins/" },
        ],
        sidebar: {
          "/de/guide/": [
            {
              text: "Benutzerhandbuch",
              items: [
                { text: "Erste Schritte", link: "/de/guide/" },
                { text: "Bibliothek & Spiele", link: "/de/guide/library" },
                { text: "Plugins & Themes", link: "/de/guide/plugins-and-themes" },
                { text: "Offizielle Plugins", link: "/de/guide/official-plugins" },
                { text: "Big-Picture-Modus", link: "/de/guide/big-picture" },
              ],
            },
          ],
          "/de/plugins/": [
            {
              text: "Plugin-Entwicklung",
              items: [
                { text: "Architekturübersicht", link: "/de/plugins/" },
                { text: "Erste Schritte", link: "/de/plugins/getting-started" },
                { text: "Manifest-Referenz", link: "/de/plugins/manifest-reference" },
                { text: "Theme-Manifeste", link: "/de/plugins/theme-manifests" },
                { text: "WIT-Schnittstelle", link: "/de/plugins/wit-interface" },
                { text: "Sicherheitsmodell", link: "/de/plugins/security-model" },
                { text: "Veröffentlichung", link: "/de/plugins/publishing" },
              ],
            },
          ],
        },
      },
    },
    "pt-br": {
      label: "Português (Brasil)",
      lang: "pt-BR",
      link: "/pt-br/",
      themeConfig: {
        nav: [
          { text: "Início", link: "/pt-br/" },
          { text: "Guia do usuário", link: "/pt-br/guide/" },
          { text: "Documentação de plugins", link: "/pt-br/plugins/" },
        ],
        sidebar: {
          "/pt-br/guide/": [
            {
              text: "Guia do usuário",
              items: [
                { text: "Primeiros passos", link: "/pt-br/guide/" },
                { text: "Biblioteca e jogos", link: "/pt-br/guide/library" },
                { text: "Plugins e temas", link: "/pt-br/guide/plugins-and-themes" },
                { text: "Plugins oficiais", link: "/pt-br/guide/official-plugins" },
                { text: "Modo Big Picture", link: "/pt-br/guide/big-picture" },
              ],
            },
          ],
          "/pt-br/plugins/": [
            {
              text: "Desenvolvimento de plugins",
              items: [
                { text: "Visão geral da arquitetura", link: "/pt-br/plugins/" },
                { text: "Primeiros passos", link: "/pt-br/plugins/getting-started" },
                { text: "Referência do manifesto", link: "/pt-br/plugins/manifest-reference" },
                { text: "Manifestos de tema", link: "/pt-br/plugins/theme-manifests" },
                { text: "Interface WIT", link: "/pt-br/plugins/wit-interface" },
                { text: "Modelo de segurança", link: "/pt-br/plugins/security-model" },
                { text: "Publicação", link: "/pt-br/plugins/publishing" },
              ],
            },
          ],
        },
      },
    },
    ru: {
      label: "Русский",
      lang: "ru",
      link: "/ru/",
      themeConfig: {
        nav: [
          { text: "Главная", link: "/ru/" },
          { text: "Руководство пользователя", link: "/ru/guide/" },
          { text: "Документация плагинов", link: "/ru/plugins/" },
        ],
        sidebar: {
          "/ru/guide/": [
            {
              text: "Руководство пользователя",
              items: [
                { text: "Начало работы", link: "/ru/guide/" },
                { text: "Библиотека и игры", link: "/ru/guide/library" },
                { text: "Плагины и темы", link: "/ru/guide/plugins-and-themes" },
                { text: "Официальные плагины", link: "/ru/guide/official-plugins" },
                { text: "Режим Big Picture", link: "/ru/guide/big-picture" },
              ],
            },
          ],
          "/ru/plugins/": [
            {
              text: "Разработка плагинов",
              items: [
                { text: "Обзор архитектуры", link: "/ru/plugins/" },
                { text: "Начало работы", link: "/ru/plugins/getting-started" },
                { text: "Справочник манифеста", link: "/ru/plugins/manifest-reference" },
                { text: "Манифесты тем", link: "/ru/plugins/theme-manifests" },
                { text: "Интерфейс WIT", link: "/ru/plugins/wit-interface" },
                { text: "Модель безопасности", link: "/ru/plugins/security-model" },
                { text: "Публикация", link: "/ru/plugins/publishing" },
              ],
            },
          ],
        },
      },
    },
    it: {
      label: "Italiano",
      lang: "it",
      link: "/it/",
      themeConfig: {
        nav: [
          { text: "Home", link: "/it/" },
          { text: "Guida utente", link: "/it/guide/" },
          { text: "Documentazione plugin", link: "/it/plugins/" },
        ],
        sidebar: {
          "/it/guide/": [
            {
              text: "Guida utente",
              items: [
                { text: "Per iniziare", link: "/it/guide/" },
                { text: "Libreria e giochi", link: "/it/guide/library" },
                { text: "Plugin e temi", link: "/it/guide/plugins-and-themes" },
                { text: "Plugin ufficiali", link: "/it/guide/official-plugins" },
                { text: "Modalità Big Picture", link: "/it/guide/big-picture" },
              ],
            },
          ],
          "/it/plugins/": [
            {
              text: "Sviluppo plugin",
              items: [
                { text: "Panoramica dell'architettura", link: "/it/plugins/" },
                { text: "Per iniziare", link: "/it/plugins/getting-started" },
                { text: "Riferimento manifesto", link: "/it/plugins/manifest-reference" },
                { text: "Manifesti tema", link: "/it/plugins/theme-manifests" },
                { text: "Interfaccia WIT", link: "/it/plugins/wit-interface" },
                { text: "Modello di sicurezza", link: "/it/plugins/security-model" },
                { text: "Pubblicazione", link: "/it/plugins/publishing" },
              ],
            },
          ],
        },
      },
    },
  },

  themeConfig: {
    socialLinks: [{ icon: "github", link: "https://github.com/smh0505/Concourse" }],

    search: {
      provider: "local",
    },
  },
});
