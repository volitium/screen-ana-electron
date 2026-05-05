<script setup lang="ts">
import type { CaptureSource } from "../types";

defineProps<{
  sources: CaptureSource[];
}>();

defineEmits<{
  select: [source: CaptureSource];
  close: [];
}>();
</script>

<template>
  <div class="modal-backdrop">
    <div class="modal">
      <div class="modal-header">
        <h2>Select Capture Source</h2>
        <button @click="$emit('close')">Close</button>
      </div>

      <div class="source-grid">
        <button
          v-for="source in sources"
          :key="source.id"
          class="source-card"
          @click="$emit('select', source)"
        >
          <img :src="source.thumbnail" :alt="source.name" />
          <span>{{ source.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>