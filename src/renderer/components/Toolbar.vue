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
  autoBox: [];
  toggleAlwaysOnTop: [];
  toggleTheme: [];
  updateInterval: [value: number];
  startInterval: [];
  stopInterval: [];
}>();
</script>

<template>
  <header class="toolbar">
    <div class="toolbar-left">
      <button @click="$emit('capture')">Select Screen / Window</button>
      <button :disabled="!hasImage" @click="$emit('refresh')">Refresh Capture</button>
      <button :disabled="!hasImage" @click="$emit('autoBox')">AI Auto Box Mock</button>
    </div>

    <div class="toolbar-right">
      <label>
        Interval
        <input
          type="number"
          min="1"
          :value="captureIntervalSeconds"
          @input="$emit('updateInterval', Number(($event.target as HTMLInputElement).value))"
        />
        sec
      </label>

      <button v-if="!isIntervalRunning" :disabled="!hasImage" @click="$emit('startInterval')">
        Start Interval
      </button>

      <button v-else @click="$emit('stopInterval')">
        Stop Interval
      </button>

      <button @click="$emit('toggleAlwaysOnTop')">
        Always On Top: {{ alwaysOnTop ? "On" : "Off" }}
      </button>

      <button @click="$emit('toggleTheme')">
        Theme: {{ theme }}
      </button>
    </div>
  </header>
</template>