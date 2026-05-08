<script setup lang="ts">
defineProps<{
  hasImage: boolean;
  alwaysOnTop: boolean;
  theme: "dark" | "light";
  captureIntervalSeconds: number;
  isIntervalRunning: boolean;
}>();

defineEmits<{
  capture: [];
  refresh: [];
  toggleAlwaysOnTop: [];
  toggleTheme: [];
  updateInterval: [value: number];
  startInterval: [];
  stopInterval: [];
  minimize: [];
  close: [];
}>();
</script>

<template>
  <header class="toolbar">
    <div class="toolbar-drag">
      <span class="app-title">Screen Analysis Overlay</span>
    </div>

    <div class="toolbar-left">
      <button @click="$emit('capture')">Select Screen / Window</button>
      <button :disabled="!hasImage" @click="$emit('refresh')">Refresh</button>
    </div>

    <div class="toolbar-right">
      <label>
        Interval
        <input
          type="number"
          min="0.5"
          step="0.5"
          :value="captureIntervalSeconds"
          @input="$emit('updateInterval', Number(($event.target as HTMLInputElement).value))"
        />
        sec
      </label>

      <button v-if="!isIntervalRunning" :disabled="!hasImage" @click="$emit('startInterval')">
        Start Live
      </button>

      <button v-else @click="$emit('stopInterval')">
        Stop Live
      </button>

      <button @click="$emit('toggleAlwaysOnTop')">
        Top: {{ alwaysOnTop ? "On" : "Off" }}
      </button>

      <button @click="$emit('toggleTheme')">
        {{ theme === "dark" ? "Light" : "Dark" }}
      </button>

      <button @click="$emit('minimize')">_</button>
      <button class="danger-btn" @click="$emit('close')">X</button>
    </div>
  </header>
</template>