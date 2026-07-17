<script setup lang="ts">
const sgdbApiKey = defineModel<string>("sgdbApiKey", { default: "" });
const igdbClientId = defineModel<string>("igdbClientId", { default: "" });
const igdbClientSecret = defineModel<string>("igdbClientSecret", { default: "" });

const emit = defineEmits<{ save: [] }>();
</script>

<template>
  <form class="settings-form" @submit.prevent="emit('save')">
    <input v-model="sgdbApiKey" type="password" placeholder="SteamGridDB API key" />
    <input v-model="igdbClientId" type="password" placeholder="IGDB client ID" />
    <input v-model="igdbClientSecret" type="password" placeholder="IGDB client secret" />
    <button type="submit">Save Keys</button>
  </form>
</template>

<style scoped>
.settings-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.settings-form input {
  flex: 1;
}
</style>
