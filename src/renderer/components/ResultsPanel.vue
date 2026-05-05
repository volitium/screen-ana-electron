<script setup lang="ts">
import { ref } from "vue";
import type { BoxItem } from "../types";

defineProps<{
  boxes: BoxItem[];
}>();

defineEmits<{
  deleteBox: [id: number];
  reanalyze: [id: number];
}>();

const openSections = ref<Record<number, boolean>>({});

function toggle(id: number): void {
  openSections.value[id] = !openSections.value[id];
}

function isOpen(id: number): boolean {
  return openSections.value[id] !== false;
}
</script>

<template>
  <aside class="results">
    <h2>Analysis Results</h2>

    <div v-if="boxes.length === 0" class="results-empty">
      No boxes selected yet.
    </div>

    <div
      v-for="box in boxes"
      :key="box.id"
      class="result-card"
    >
      <div class="result-header">
        <button class="result-title" @click="toggle(box.id)">
          {{ isOpen(box.id) ? "▼" : "▶" }} {{ box.label }}
        </button>

        <div class="result-actions">
          <button @click="$emit('reanalyze', box.id)">Analyze</button>
          <button @click="$emit('deleteBox', box.id)">Delete</button>
        </div>
      </div>

      <div v-if="isOpen(box.id)" class="result-body">
        <p>
          Region:
          x={{ Math.round(box.x) }},
          y={{ Math.round(box.y) }},
          w={{ Math.round(box.width) }},
          h={{ Math.round(box.height) }}
        </p>

        <p v-if="box.loading">Analyzing...</p>

        <p v-else-if="box.error" class="error">
          {{ box.error }}
        </p>

        <div v-else-if="box.result">
          <p>
            <strong>Result:</strong>
            {{ box.result.result }}
          </p>

          <p>
            <strong>Confidence:</strong>
            {{ box.result.confidance || box.result.confidence || "N/A" }}
          </p>

          <p>
            <strong>Meta:</strong>
            {{ box.result.meta || "N/A" }}
          </p>
        </div>

        <p v-else>
          No result yet.
        </p>
      </div>
    </div>
  </aside>
</template>