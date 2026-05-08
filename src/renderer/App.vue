<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { ScreenBox } from "./types";
import { analyzeImageRegion } from "./api/analysisApi";

const videoRef = ref<HTMLVideoElement | null>(null);

const stream = ref<MediaStream | null>(null);
const isLive = ref(false);
const isAnalyzing = ref(false);
const alwaysOnTop = ref(true);

const intervalSeconds = ref(60);
const timerRunning = ref(false);
const intervalHandle = ref<number | null>(null);

const latestAnswer = ref("Select a screen to begin.");

const boxes = ref<ScreenBox[]>([]);

async function selectScreen(): Promise<void> {
  try {
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
    isLive.value = true;
    latestAnswer.value = "Screen connected. Click Draw / Edit Boxes to freeze and select areas.";

    await window.electronAPI.setOverlayBoxes([]);

    mediaStream.getVideoTracks()[0].addEventListener("ended", () => {
      stopScreen();
    });
  } catch {
    latestAnswer.value = "Screen selection was cancelled or failed.";
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
  latestAnswer.value = "Screen access stopped.";

  await window.electronAPI.screenStopped();
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

  latestAnswer.value = "Drawing screen opened. Draw, move, resize, or delete boxes.";

  await window.electronAPI.startDraw({
    frozenImageDataUrl: frame,
    boxes: boxes.value
  });
}

async function deleteBox(id: number): Promise<void> {
  boxes.value = boxes.value.filter((box) => box.id !== id);
  await window.electronAPI.setOverlayBoxes(boxes.value);
}

async function cropBoxFromCurrentFrame(box: ScreenBox): Promise<string | null> {
  const videoCanvas = captureWholeFrameCanvas();

  if (!videoCanvas) {
    return null;
  }

  const overlaySize = await window.electronAPI.getOverlaySize();

  if (overlaySize.width === 0 || overlaySize.height === 0) {
    return null;
  }

  const scaleX = videoCanvas.width / overlaySize.width;
  const scaleY = videoCanvas.height / overlaySize.height;

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
  const box = boxes.value.find((item) => item.id === id);

  if (!box || !isLive.value) {
    return;
  }

  const croppedImage = await cropBoxFromCurrentFrame(box);

  if (!croppedImage) {
    box.error = "Could not capture selected region.";
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

  await window.electronAPI.setOverlayBoxes(boxes.value);
}

async function analyzeAll(): Promise<void> {
  if (!isLive.value || isAnalyzing.value) {
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
  window.electronAPI.minimizeWindow();
}

function closeApp(): void {
  stopScreen();
  window.electronAPI.closeWindow();
}

onMounted(() => {
  const cleanupPanelBoxes = window.electronAPI.onPanelBoxesUpdated((updatedBoxes) => {
    boxes.value = structuredClone(updatedBoxes);
    window.electronAPI.setOverlayBoxes(boxes.value);
    latestAnswer.value = "Boxes updated. You can interact with Chrome/Zoom now.";
  });

  onBeforeUnmount(() => {
    cleanupPanelBoxes();
  });
});

onBeforeUnmount(() => {
  stopTimer();

  if (stream.value) {
    for (const track of stream.value.getTracks()) {
      track.stop();
    }
  }
});
</script>

<template>
  <div class="panel-root">
    <video ref="videoRef" class="hidden-video" muted playsinline></video>

    <section class="assistant-panel">
      <header class="top-bar">
        <div class="drag-area">
          <div class="status-dot" :class="{ active: isLive }"></div>
          <span>Screen Analysis Panel</span>
        </div>

        <button @click="minimizeApp">_</button>
        <button class="danger" @click="closeApp">X</button>
      </header>

      <main class="panel-content">
        <button v-if="!isLive" class="primary-btn full-width" @click="selectScreen">
          Select Screen / Window
        </button>

        <button v-else class="secondary-btn full-width" @click="stopScreen">
          Stop Screen Access
        </button>

        <button :disabled="!isLive" class="primary-btn full-width" @click="enterDrawMode">
          Draw / Edit Boxes
        </button>

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
            Start Timer
          </button>

          <button v-else @click="stopTimer">
            Stop Timer
          </button>
        </div>

        <button @click="toggleAlwaysOnTop">
          Always On Top: {{ alwaysOnTop ? "On" : "Off" }}
        </button>

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