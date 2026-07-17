<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <p v-if="message" class="error">{{ message }}</p>
</template>

<style scoped>
.error {
  color: #d33;
}
</style>
