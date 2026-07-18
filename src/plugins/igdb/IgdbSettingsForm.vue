<script setup lang="ts">
import { onMounted, ref } from "vue";
import { settings as settingsRepo } from "../../db";

const IGDB_CLIENT_ID_SETTING = "igdb_client_id";
const IGDB_CLIENT_SECRET_SETTING = "igdb_client_secret";

const clientId = ref("");
const clientSecret = ref("");

async function onSave() {
  await settingsRepo.set(IGDB_CLIENT_ID_SETTING, clientId.value.trim());
  await settingsRepo.set(IGDB_CLIENT_SECRET_SETTING, clientSecret.value.trim());
}

onMounted(async () => {
  clientId.value = (await settingsRepo.get(IGDB_CLIENT_ID_SETTING)) ?? "";
  clientSecret.value = (await settingsRepo.get(IGDB_CLIENT_SECRET_SETTING)) ?? "";
});
</script>

<template>
  <form class="settings-form" @submit.prevent="onSave">
    <input v-model="clientId" type="password" placeholder="IGDB client ID" />
    <input v-model="clientSecret" type="password" placeholder="IGDB client secret" />
    <button type="submit">Save Keys</button>
  </form>
</template>

<style scoped>
.settings-form {
  display: flex;
  gap: 0.5rem;
}

.settings-form input {
  flex: 1;
  font-size: 0.85rem;
}
</style>
