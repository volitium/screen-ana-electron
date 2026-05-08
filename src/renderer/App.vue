<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { ScreenBox } from "./types";
import { analyzeImageRegion } from "./api/analysisApi";

const videoRef = ref<HTMLVideoElement | null>(null);
const drawLayerRef = ref<HTMLDivElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const stream = ref<MediaStream | null>(null);
const isLive = ref(false);
const isAnalyzing = ref(false);
const alwaysOnTop = ref(true);

const intervalSeconds = ref(60);
const timerRunning = ref(false);
const intervalHandle = ref<number | null>(null);

const latestAnswer = ref("Select a screen to begin.");

const boxes = ref<ScreenBox[]>([]);
const nextBoxId = ref(1);

const isDrawMode = ref(false);
const frozenImageDataUrl = ref("");

const isDrawing = ref(false);
const startX = ref(0);
const startY = ref(0);
const currentX = ref(0);
const currentY = ref(0);

const draggingBoxId = ref<number | null>(null);
const resizingBoxId = ref<number | null>(null);
const selectedBoxId = ref<number | null>(null);
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);

type PanelPosition = "top-left" | "top-right" | "bottom-right" | "bottom-left";

const panelPosition = ref<PanelPosition>("top-right");

const panelPositionClass = computed(() => {
  return `panel-${panelPosition.value}`;
});

const draftBoxStyle = computed(() => {
  const x = Math.min(startX.value, currentX.value);
  const y = Math.min(startY.value, currentY.value);
  const width = Math.abs(currentX.value - startX.value);
  const height = Math.abs(currentY.value - startY.value);

  return {
    left: x + "px",
    top: y + "px",
    width: width + "px",
    height: height + "px"
  };
});

async function reportPanelBounds(): Promise<void> {
  await nextTick();

  const panel = panelRef.value;

  if (!panel) {
    return;
  }

  const rect = panel.getBoundingClientRect();

  await window.electronAPI.setPanelBounds({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  });
}

async function enableClickThroughOutsidePanel(): Promise<void> {
  await reportPanelBounds();
  await window.electronAPI.setDrawingMode(false);
  await window.electronAPI.setBrowserInteractionMode(true);
}

async function setPanelPosition(position: PanelPosition): Promise<void> {
  panelPosition.value = position;
  await enableClickThroughOutsidePanel();
}

async function selectScreen(): Promise<void> {
  try {
    await window.electronAPI.setBrowserInteractionMode(false);
    await window.electronAPI.setDrawingMode(false);

    const mediaStream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        frameRate: 15,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    stream.value = mediaStream;

    await nextTick();

    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream;
      await videoRef.value.play();
    }

    boxes.value = [];
    nextBoxId.value = 1;
    isLive.value = true;
    latestAnswer.value = "Screen connected. Click Draw / Edit Boxes.";

    mediaStream.getVideoTracks()[0].addEventListener("ended", () => {
      stopScreen();
    });

    await enableClickThroughOutsidePanel();
  } catch {
    latestAnswer.value = "Screen selection was cancelled or failed.";
    await enableClickThroughOutsidePanel();
  }
}

async function stopScreen(): Promise<void> {
  stopTimer();

  if (stream.value) {
    for (const track of stream.value.getTracks()) {
      track.stop();
    }
  }

  stream.value = null;
  isLive.value = false;
  boxes.value = [];
  nextBoxId.value = 1;
  isDrawMode.value = false;
  frozenImageDataUrl.value = "";
  latestAnswer.value = "Screen access stopped.";

  await enableClickThroughOutsidePanel();
}

function captureWholeFrameCanvas(): HTMLCanvasElement | null {
  const video = videoRef.value;

  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas;
}

function captureWholeFrameDataUrl(): string | null {
  const canvas = captureWholeFrameCanvas();

  if (!canvas) {
    return null;
  }

  return canvas.toDataURL("image/jpeg", 0.76);
}

async function enterDrawMode(): Promise<void> {
  if (!isLive.value) {
    latestAnswer.value = "Select a screen first.";
    return;
  }

  const frame = captureWholeFrameDataUrl();

  if (!frame) {
    latestAnswer.value = "Could not freeze screen yet. Try again in a second.";
    return;
  }

  frozenImageDataUrl.value = frame;
  isDrawMode.value = true;
  latestAnswer.value = "Draw mode active. Draw, move, resize, or delete boxes.";

  await window.electronAPI.setBrowserInteractionMode(false);
  await window.electronAPI.setDrawingMode(true);
}

async function finishDrawing(): Promise<void> {
  isDrawMode.value = false;
  frozenImageDataUrl.value = "";
  isDrawing.value = false;
  draggingBoxId.value = null;
  resizingBoxId.value = null;

  latestAnswer.value =
    "Drawing finished. Chrome/Zoom is clickable outside the panel. The panel remains clickable.";

  await enableClickThroughOutsidePanel();
}

function getPointerPosition(event: MouseEvent): { x: number; y: number } {
  const rect = drawLayerRef.value?.getBoundingClientRect();

  if (!rect) {
    return { x: 0, y: 0 };
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function onDrawMouseDown(event: MouseEvent): void {
  if (!isDrawMode.value) {
    return;
  }

  const target = event.target as HTMLElement;

  if (target.closest(".screen-box") || target.closest(".assistant-panel")) {
    return;
  }

  const pos = getPointerPosition(event);

  isDrawing.value = true;
  startX.value = pos.x;
  startY.value = pos.y;
  currentX.value = pos.x;
  currentY.value = pos.y;
}

function onDrawMouseMove(event: MouseEvent): void {
  if (!isDrawMode.value) {
    return;
  }

  const pos = getPointerPosition(event);

  if (isDrawing.value) {
    currentX.value = pos.x;
    currentY.value = pos.y;
    return;
  }

  if (draggingBoxId.value !== null) {
    const box = boxes.value.find((item) => item.id === draggingBoxId.value);

    if (!box || !drawLayerRef.value) {
      return;
    }

    const maxX = drawLayerRef.value.clientWidth - box.width;
    const maxY = drawLayerRef.value.clientHeight - box.height;

    box.x = clamp(pos.x - dragOffsetX.value, 0, maxX);
    box.y = clamp(pos.y - dragOffsetY.value, 0, maxY);
  }

  if (resizingBoxId.value !== null) {
    const box = boxes.value.find((item) => item.id === resizingBoxId.value);

    if (!box || !drawLayerRef.value) {
      return;
    }

    box.width = clamp(pos.x - box.x, 40, drawLayerRef.value.clientWidth - box.x);
    box.height = clamp(pos.y - box.y, 40, drawLayerRef.value.clientHeight - box.y);
  }
}

function onDrawMouseUp(): void {
  if (isDrawing.value) {
    const x = Math.min(startX.value, currentX.value);
    const y = Math.min(startY.value, currentY.value);
    const width = Math.abs(currentX.value - startX.value);
    const height = Math.abs(currentY.value - startY.value);

    if (width > 40 && height > 40) {
      const id = nextBoxId.value;

      boxes.value.push({
        id,
        label: "Box " + id,
        x,
        y,
        width,
        height,
        loading: false,
        error: null,
        result: null
      });

      selectedBoxId.value = id;
      nextBoxId.value += 1;
    }
  }

  isDrawing.value = false;
  draggingBoxId.value = null;
  resizingBoxId.value = null;
}

function startDragging(event: MouseEvent, box: ScreenBox): void {
  if (!isDrawMode.value) {
    return;
  }

  event.stopPropagation();

  const pos = getPointerPosition(event);

  selectedBoxId.value = box.id;
  draggingBoxId.value = box.id;
  dragOffsetX.value = pos.x - box.x;
  dragOffsetY.value = pos.y - box.y;
}

function startResizing(event: MouseEvent, box: ScreenBox): void {
  if (!isDrawMode.value) {
    return;
  }

  event.stopPropagation();

  selectedBoxId.value = box.id;
  resizingBoxId.value = box.id;
}

function deleteBox(id: number): void {
  boxes.value = boxes.value.filter((box) => box.id !== id);

  if (selectedBoxId.value === id) {
    selectedBoxId.value = null;
  }
}

function getBoxStyle(box: ScreenBox): Record<string, string> {
  return {
    left: box.x + "px",
    top: box.y + "px",
    width: box.width + "px",
    height: box.height + "px"
  };
}

async function cropBoxFromCurrentFrame(box: ScreenBox): Promise<string | null> {
  const videoCanvas = captureWholeFrameCanvas();

  if (!videoCanvas) {
    return null;
  }

  const windowSize = await window.electronAPI.getWindowSize();

  if (windowSize.width === 0 || windowSize.height === 0) {
    return null;
  }

  const scaleX = videoCanvas.width / windowSize.width;
  const scaleY = videoCanvas.height / windowSize.height;

  const cropX = Math.round(box.x * scaleX);
  const cropY = Math.round(box.y * scaleY);
  const cropWidth = Math.round(box.width * scaleX);
  const cropHeight = Math.round(box.height * scaleY);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;

  const context = cropCanvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.drawImage(
    videoCanvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  return cropCanvas.toDataURL("image/jpeg", 0.74);
}

async function analyzeSingleBox(id: number): Promise<void> {
  await window.electronAPI.setBrowserInteractionMode(false);

  const box = boxes.value.find((item) => item.id === id);

  if (!box || !isLive.value) {
    await enableClickThroughOutsidePanel();
    return;
  }

  const croppedImage = await cropBoxFromCurrentFrame(box);

  if (!croppedImage) {
    box.error = "Could not capture selected region.";
    await enableClickThroughOutsidePanel();
    return;
  }

  box.loading = true;
  box.error = null;

  try {
    box.result = await analyzeImageRegion(croppedImage);
  } catch (error) {
    box.error = error instanceof Error ? error.message : "Analysis failed.";
  } finally {
    box.loading = false;
  }

  await enableClickThroughOutsidePanel();
}

async function analyzeAll(): Promise<void> {
  await window.electronAPI.setBrowserInteractionMode(false);

  if (!isLive.value || isAnalyzing.value) {
    await enableClickThroughOutsidePanel();
    return;
  }

  isAnalyzing.value = true;

  try {
    if (boxes.value.length === 0) {
      latestAnswer.value = "No boxes selected. Click Draw / Edit Boxes first.";
      return;
    }

    latestAnswer.value = "Analyzing all boxes...";

    for (const box of boxes.value) {
      await analyzeSingleBox(box.id);
    }

    latestAnswer.value = "All boxes analyzed.";
  } catch (error) {
    latestAnswer.value = error instanceof Error ? error.message : "Analysis failed.";
  } finally {
    isAnalyzing.value = false;
    await enableClickThroughOutsidePanel();
  }
}

function startTimer(): void {
  stopTimer();

  if (!isLive.value) {
    latestAnswer.value = "Select a screen first.";
    return;
  }

  timerRunning.value = true;
  latestAnswer.value = `Auto analysis started: every ${intervalSeconds.value} seconds.`;

  intervalHandle.value = window.setInterval(() => {
    analyzeAll();
  }, Math.max(intervalSeconds.value, 1) * 1000);
}

function stopTimer(): void {
  if (intervalHandle.value !== null) {
    clearInterval(intervalHandle.value);
    intervalHandle.value = null;
  }

  timerRunning.value = false;
}

async function toggleAlwaysOnTop(): Promise<void> {
  alwaysOnTop.value = !alwaysOnTop.value;
  await window.electronAPI.setAlwaysOnTop(alwaysOnTop.value);
}

function minimizeApp(): void {
  if (isDrawMode.value) {
    return;
  }

  window.electronAPI.minimizeWindow();
}

function closeApp(): void {
  stopScreen();
  window.electronAPI.closeWindow();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

onMounted(async () => {
  await enableClickThroughOutsidePanel();

  window.addEventListener("resize", reportPanelBounds);
});

onBeforeUnmount(() => {
  stopTimer();

  window.removeEventListener("resize", reportPanelBounds);

  if (stream.value) {
    for (const track of stream.value.getTracks()) {
      track.stop();
    }
  }
});
</script>

<template>
  <div class="overlay-root">
    <video ref="videoRef" class="hidden-video" muted playsinline></video>

    <div
      v-if="isDrawMode"
      ref="drawLayerRef"
      class="draw-layer"
      @mousedown="onDrawMouseDown"
      @mousemove="onDrawMouseMove"
      @mouseup="onDrawMouseUp"
      @mouseleave="onDrawMouseUp"
    >
      <img class="frozen-screen" :src="frozenImageDataUrl" alt="Frozen screen" />

      <div class="draw-mode-banner">
        DRAW MODE - DRAW, MOVE, RESIZE, OR DELETE BOXES
      </div>

      <div
        v-for="box in boxes"
        :key="box.id"
        class="screen-box"
        :class="{ selected: selectedBoxId === box.id }"
        :style="getBoxStyle(box)"
        @mousedown="startDragging($event, box)"
      >
        <div class="screen-box-label">
          {{ box.label }}
          <button @click.stop="deleteBox(box.id)">x</button>
        </div>

        <div class="resize-handle" @mousedown="startResizing($event, box)"></div>
      </div>

      <div v-if="isDrawing" class="draft-box" :style="draftBoxStyle"></div>
    </div>

    <div v-else class="box-display-layer">
      <div
        v-for="box in boxes"
        :key="box.id"
        class="screen-box passive-box"
        :style="getBoxStyle(box)"
      >
        <div class="screen-box-label">
          {{ box.label }}
        </div>
      </div>
    </div>

    <section ref="panelRef" class="assistant-panel" :class="panelPositionClass">
      <header class="top-bar">
        <div class="drag-area">
          <div class="status-dot" :class="{ active: isLive }"></div>
          <span>Screen Analysis</span>
        </div>

        <button :disabled="isDrawMode" @click="minimizeApp">_</button>
        <button class="danger" @click="closeApp">X</button>
      </header>

      <main class="panel-content">
        <button v-if="!isLive" class="primary-btn full-width" @click="selectScreen">
          Select Screen
        </button>

        <button v-else class="secondary-btn full-width" @click="stopScreen">
          Stop Access
        </button>

        <div class="button-row">
          <button :disabled="!isLive" class="primary-btn" @click="enterDrawMode">
            Draw / Edit
          </button>

          <button :disabled="!isLive || !isDrawMode" class="primary-btn" @click="finishDrawing">
            Finish
          </button>
        </div>

        <button
          :disabled="!isLive || isAnalyzing"
          class="primary-btn full-width"
          @click="analyzeAll"
        >
          {{ isAnalyzing ? "Analyzing..." : "Analyze All" }}
        </button>

        <div class="timer-row">
          <label>
            Every
            <input v-model.number="intervalSeconds" type="number" min="1" step="1" />
            sec
          </label>

          <button v-if="!timerRunning" :disabled="!isLive" @click="startTimer">
            Start
          </button>

          <button v-else @click="stopTimer">
            Stop
          </button>
        </div>

        <button @click="toggleAlwaysOnTop">
          Top: {{ alwaysOnTop ? "On" : "Off" }}
        </button>

        <div class="position-row">
          <button
            :class="{ selectedPosition: panelPosition === 'top-left' }"
            @click="setPanelPosition('top-left')"
          >
            Top Left
          </button>

          <button
            :class="{ selectedPosition: panelPosition === 'top-right' }"
            @click="setPanelPosition('top-right')"
          >
            Top Right
          </button>

          <button
            :class="{ selectedPosition: panelPosition === 'bottom-right' }"
            @click="setPanelPosition('bottom-right')"
          >
            Bottom Right
          </button>

          <button
            :class="{ selectedPosition: panelPosition === 'bottom-left' }"
            @click="setPanelPosition('bottom-left')"
          >
            Bottom Left
          </button>
        </div>

        <pre class="answer-box">{{ latestAnswer }}</pre>

        <section v-if="boxes.length > 0" class="box-results">
          <div v-for="box in boxes" :key="box.id" class="box-result-card">
            <div class="box-result-header">
              <strong>{{ box.label }}</strong>

              <div class="small-actions">
                <button :disabled="box.loading" @click="analyzeSingleBox(box.id)">
                  Analyze
                </button>
                <button class="danger-small" @click="deleteBox(box.id)">Delete</button>
              </div>
            </div>

            <p>
              Region:
              x={{ Math.round(box.x) }},
              y={{ Math.round(box.y) }},
              w={{ Math.round(box.width) }},
              h={{ Math.round(box.height) }}
            </p>

            <p v-if="box.loading">Analyzing...</p>

            <p v-else-if="box.error" class="error-text">
              {{ box.error }}
            </p>

            <div v-else-if="box.result">
              <p>Result: {{ box.result.result }}</p>
              <p>Confidence: {{ box.result.confidance || box.result.confidence || "N/A" }}</p>
              <p>Meta: {{ box.result.meta || "N/A" }}</p>
            </div>

            <p v-else>No result yet.</p>
          </div>
        </section>
      </main>
    </section>
  </div>
</template>