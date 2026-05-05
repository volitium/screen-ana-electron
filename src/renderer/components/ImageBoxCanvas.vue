<script setup lang="ts">
import { computed, ref } from "vue";
import type { BoxItem } from "../types";

const props = defineProps<{
  imageDataUrl: string;
  boxes: BoxItem[];
}>();

const emit = defineEmits<{
  addBox: [box: Omit<BoxItem, "id" | "label" | "loading" | "error" | "result">];
  updateBox: [box: BoxItem];
  deleteBox: [id: number];
}>();

const wrapperRef = ref<HTMLDivElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);

const isDrawing = ref(false);
const startX = ref(0);
const startY = ref(0);
const currentX = ref(0);
const currentY = ref(0);

const draggingBoxId = ref<number | null>(null);
const resizingBoxId = ref<number | null>(null);
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);

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

function getPointerPosition(event: MouseEvent): { x: number; y: number } {
  const rect = wrapperRef.value?.getBoundingClientRect();

  if (!rect) {
    return { x: 0, y: 0 };
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function onMouseDown(event: MouseEvent): void {
  if (!props.imageDataUrl) {
    return;
  }

  if ((event.target as HTMLElement).classList.contains("box")) {
    return;
  }

  const pos = getPointerPosition(event);
  isDrawing.value = true;
  startX.value = pos.x;
  startY.value = pos.y;
  currentX.value = pos.x;
  currentY.value = pos.y;
}

function onMouseMove(event: MouseEvent): void {
  const pos = getPointerPosition(event);

  if (isDrawing.value) {
    currentX.value = pos.x;
    currentY.value = pos.y;
    return;
  }

  if (draggingBoxId.value !== null) {
    const box = props.boxes.find((item) => item.id === draggingBoxId.value);

    if (!box) {
      return;
    }

    emit("updateBox", {
      ...box,
      x: Math.max(0, pos.x - dragOffsetX.value),
      y: Math.max(0, pos.y - dragOffsetY.value)
    });
  }

  if (resizingBoxId.value !== null) {
    const box = props.boxes.find((item) => item.id === resizingBoxId.value);

    if (!box) {
      return;
    }

    emit("updateBox", {
      ...box,
      width: Math.max(30, pos.x - box.x),
      height: Math.max(30, pos.y - box.y)
    });
  }
}

function onMouseUp(): void {
  if (isDrawing.value) {
    const x = Math.min(startX.value, currentX.value);
    const y = Math.min(startY.value, currentY.value);
    const width = Math.abs(currentX.value - startX.value);
    const height = Math.abs(currentY.value - startY.value);

    if (width > 20 && height > 20) {
      emit("addBox", {
        x,
        y,
        width,
        height,
        color: "#40a9ff",
        borderWidth: 2,
        opacity: 0.25
      });
    }
  }

  isDrawing.value = false;
  draggingBoxId.value = null;
  resizingBoxId.value = null;
}

function startDragging(event: MouseEvent, box: BoxItem): void {
  event.stopPropagation();

  const pos = getPointerPosition(event);
  draggingBoxId.value = box.id;
  dragOffsetX.value = pos.x - box.x;
  dragOffsetY.value = pos.y - box.y;
}

function startResizing(event: MouseEvent, box: BoxItem): void {
  event.stopPropagation();
  resizingBoxId.value = box.id;
}

function boxStyle(box: BoxItem): Record<string, string> {
  return {
    left: box.x + "px",
    top: box.y + "px",
    width: box.width + "px",
    height: box.height + "px",
    borderColor: box.color,
    borderWidth: box.borderWidth + "px",
    backgroundColor: box.color + Math.round(box.opacity * 255).toString(16).padStart(2, "0")
  };
}
</script>

<template>
  <div class="canvas-shell">
    <div
      ref="wrapperRef"
      class="image-wrapper"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
    >
      <div v-if="!imageDataUrl" class="empty-state">
        Select a screen or window to begin.
      </div>

      <img
        v-else
        ref="imageRef"
        class="capture-image"
        :src="imageDataUrl"
        alt="Screen capture"
        draggable="false"
      />

      <div
        v-for="box in boxes"
        :key="box.id"
        class="box"
        :style="boxStyle(box)"
        @mousedown="startDragging($event, box)"
      >
        <div class="box-label">
          {{ box.label }}
          <button @mousedown.stop @click.stop="$emit('deleteBox', box.id)">x</button>
        </div>

        <div
          class="resize-handle"
          @mousedown="startResizing($event, box)"
        ></div>
      </div>

      <div
        v-if="isDrawing"
        class="draft-box"
        :style="draftBoxStyle"
      ></div>
    </div>

    <p class="canvas-help">
      Click and drag to create a box. Drag a box to move it. Use the bottom-right handle to resize it.
    </p>
  </div>
</template>