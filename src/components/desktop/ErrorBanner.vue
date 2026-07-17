<script setup lang="ts">
import { useLibraryStore } from "../../stores/library";

const library = useLibraryStore();
</script>

<template>
  <p v-if="library.error" class="error">{{ library.error }}</p>
</template>

<style scoped>
.error {
  color: #d33;
}
</style>
