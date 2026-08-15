<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconCheck, IconX } from "@tabler/icons-vue";

import { useProfilesStore } from "@/stores/profiles";

const { t } = useI18n();
const profiles = useProfilesStore();

const creating = ref(false);
const newName = ref("");

async function select(id: number) {
  await profiles.switchTo(id);
}

async function confirmCreate() {
  const name = newName.value.trim();
  if (!name) return;
  const id = await profiles.createProfile(name);
  newName.value = "";
  creating.value = false;
  await select(id);
}
</script>

<template>
  <div class="switcher">
    <div class="panel">
      <h1>{{ t("profiles.switcherTitle") }}</h1>
      <div class="grid">
        <button
          v-for="profile in profiles.profiles"
          :key="profile.id"
          type="button"
          class="profile-card"
          @click="select(profile.id)"
        >
          <div class="avatar">{{ profile.name.charAt(0).toUpperCase() }}</div>
          <span class="name">{{ profile.name }}</span>
        </button>

        <form v-if="creating" class="profile-card creating" @submit.prevent="confirmCreate">
          <input
            v-model="newName"
            autofocus
            :placeholder="t('profiles.newProfileName')"
            @keyup.esc="creating = false"
          />
          <div class="creating-actions">
            <button type="submit" class="icon-button" :title="t('common.save')">
              <IconCheck :size="15" :stroke-width="1.75" />
            </button>
            <button type="button" class="icon-button" :title="t('common.cancel')" @click="creating = false">
              <IconX :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </form>
        <button v-else type="button" class="profile-card add-card" @click="creating = true">
          <div class="avatar add-avatar">+</div>
          <span class="name">{{ t("profiles.newProfile") }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.switcher {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-base);
  color: var(--color-text);
}

.panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
}

h1 {
  margin: 0;
  font-size: 1.3rem;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5);
  justify-content: center;
  max-width: 40rem;
}

.profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 8rem;
  padding: var(--space-3);
  border: none;
  background: none;
  border-radius: var(--radius-md);
  color: inherit;
  cursor: pointer;
}

.profile-card:hover,
.profile-card:focus-visible {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.avatar {
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface0);
  font-size: 1.8rem;
}

.add-avatar {
  border: 2px dashed var(--color-surface1);
  background: none;
  opacity: 0.7;
}

.name {
  font-size: 0.9rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.creating {
  cursor: default;
}

.creating input {
  width: 100%;
  text-align: center;
}

.creating-actions {
  display: flex;
  gap: var(--space-2);
}
</style>
