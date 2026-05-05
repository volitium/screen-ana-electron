<script setup lang="ts">
import { computed, ref } from "vue";
import Toolbar from "./components/Toolbar.vue";
import CaptureSourceModal from "./components/CaptureSourceModal.vue";
import ImageBoxCanvas from "./components/ImageBoxCanvas.vue";
import ResultsPanel from "./components/ResultsPanel.vue";
import type { BoxItem, CaptureSource } from "./types";
import { analyzeImageRegion } from "./api/analysisApi";

const imageDataUrl = ref<string>("");
const boxes = ref<BoxItem[]>([]);
const nextBoxId = ref(1);

const showSources = ref(false);
const captureSources = ref<CaptureSource[]>([]);
const selectedSourceId = ref<string>("");
const theme = ref<"dark" | "light">("dark");
const alwaysOnTop = ref(false);
const captureIntervalSeconds = ref(10);
const intervalHandle = ref<number | null>(null);

const appClass = computed(() => {
  return theme.value === "dark" ? "app app-dark" : "app app-light";
});

async function openCaptureSources(): Promise<void> {
  captureSources.value = await window.electronAPI.getCaptureSources();
  showSources.value = true;
}

async function selectSource(source: CaptureSource): Promise<void> {
  selectedSourceId.value = source.id;
  imageDataUrl.value = await window.electronAPI.getSourceImage(source.id);
  boxes.value = [];
  nextBoxId.value = 1;
  showSources.value = false;
}

async function refreshCapture(): Promise<void> {
  if (!selectedSourceId.value) {
    await openCaptureSources();
    return;
  }

  imageDataUrl.value = await window.electronAPI.getSourceImage(selectedSourceId.value);

  for (const box of boxes.value) {
    await runAnalysis(box.id);
  }
}

function addBox(box: Omit<BoxItem, "id" | "label" | "loading" | "error" | "result">): void {
  const id = nextBoxId.value;

  boxes.value.push({
    id,
    label: "Box " + id,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: box.color,
    borderWidth: box.borderWidth,
    opacity: box.opacity,
    loading: false,
    error: null,
    result: null
  });

  nextBoxId.value += 1;
  runAnalysis(id);
}

function updateBox(updatedBox: BoxItem): void {
  const index = boxes.value.findIndex((box) => box.id === updatedBox.id);

  if (index !== -1) {
    boxes.value[index] = updatedBox;
    runAnalysis(updatedBox.id);
  }
}

function deleteBox(id: number): void {
  boxes.value = boxes.value.filter((box) => box.id !== id);
}

async function runAnalysis(id: number): Promise<void> {
  const box = boxes.value.find((item) => item.id === id);

  if (!box || !imageDataUrl.value) {
    return;
  }

  box.loading = true;
  box.error = null;

  try {
    const croppedImage = await window.electronAPI.cropDataUrl(imageDataUrl.value, {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height
    });
    box.result = await analyzeImageRegion(croppedImage);
  } catch (error) {
    box.error = error instanceof Error ? error.message : "Unknown API error";
  } finally {
    box.loading = false;
  }
}

async function toggleAlwaysOnTop(): Promise<void> {
  alwaysOnTop.value = !alwaysOnTop.value;
  await window.electronAPI.setAlwaysOnTop(alwaysOnTop.value);
}

function toggleTheme(): void {
  theme.value = theme.value === "dark" ? "light" : "dark";
}

function startIntervalCapture(): void {
  stopIntervalCapture();

  intervalHandle.value = window.setInterval(() => {
    refreshCapture();
  }, captureIntervalSeconds.value * 1000);
}

function stopIntervalCapture(): void {
  if (intervalHandle.value !== null) {
    clearInterval(intervalHandle.value);
    intervalHandle.value = null;
  }
}

function autoBoxMock(): void {
  if (!imageDataUrl.value) {
    return;
  }

  addBox({
    x: 80,
    y: 80,
    width: 260,
    height: 160,
    color: "#40a9ff",
    borderWidth: 2,
    opacity: 0.25
  });

  addBox({
    x: 400,
    y: 140,
    width: 320,
    height: 180,
    color: "#ff4d4f",
    borderWidth: 2,
    opacity: 0.25
  });
}
</script>

<template>
  <div :class="appClass">
    <Toolbar
      :has-image="Boolean(imageDataUrl)"
      :always-on-top="alwaysOnTop"
      :theme="theme"
      :capture-interval-seconds="captureIntervalSeconds"
      :is-interval-running="intervalHandle !== null"
      @capture="openCaptureSources"
      @refresh="refreshCapture"
      @auto-box="autoBoxMock"
      @toggle-always-on-top="toggleAlwaysOnTop"
      @toggle-theme="toggleTheme"
      @update-interval="captureIntervalSeconds = $event"
      @start-interval="startIntervalCapture"
      @stop-interval="stopIntervalCapture"
    />

    <main class="main-layout">
      <section class="viewer-pane">
        <ImageBoxCanvas
          :image-data-url="imageDataUrl"
          :boxes="boxes"
          @add-box="addBox"
          @update-box="updateBox"
          @delete-box="deleteBox"
        />
      </section>

      <section class="results-pane">
        <ResultsPanel
          :boxes="boxes"
          @delete-box="deleteBox"
          @reanalyze="runAnalysis"
        />
      </section>
    </main>

    <CaptureSourceModal
      v-if="showSources"
      :sources="captureSources"
      @select="selectSource"
      @close="showSources = false"
    />
  </div>
</template>