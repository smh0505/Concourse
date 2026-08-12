import { createApp } from "vue";
import { createPinia } from "pinia";
import "./styles.css";

import QuickLaunchOverlay from "./components/quickLaunch/QuickLaunchOverlay.vue";
import { i18n } from "./i18n";

createApp(QuickLaunchOverlay).use(createPinia()).use(i18n).mount("#app");
