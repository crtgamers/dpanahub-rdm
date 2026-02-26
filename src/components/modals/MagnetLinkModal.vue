<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="magnet-overlay glass-effect"
      @click.self="$emit('close')"
    />

    <Transition name="modal-scale">
      <div
        v-if="show"
        ref="modalPanel"
        class="magnet-panel glass-effect"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descId"
      >
        <div class="magnet-header">
          <div class="magnet-icon">
            <Link2 :size="24" />
          </div>
          <h2
            :id="titleId"
            class="magnet-title"
          >
            {{ t('modals.magnetLink.title') }}
          </h2>
        </div>

        <div class="magnet-body">
          <p
            v-if="title"
            class="magnet-file-name"
          >
            {{ title }}
          </p>
          <textarea
            :id="descId"
            :value="magnetUrl"
            class="magnet-url-field"
            readonly
            rows="4"
            :aria-label="t('modals.magnetLink.magnetUrlLabel')"
          />
        </div>

        <div class="magnet-actions">
          <button
            type="button"
            class="magnet-btn magnet-btn-secondary"
            @click="copyToClipboard"
          >
            {{ copyButtonLabel }}
          </button>
          <button
            type="button"
            class="magnet-btn magnet-btn-primary"
            @click="openWithClient"
          >
            {{ t('modals.magnetLink.openWithClient') }}
          </button>
          <button
            type="button"
            class="magnet-btn magnet-btn-secondary"
            @click="$emit('close')"
          >
            {{ t('modals.magnetLink.close') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, toRef, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Link2 } from 'lucide-vue-next';
import { useModalFocusTrap } from '../../composables/useModalFocusTrap';

const props = defineProps<{
  show: boolean;
  magnetUrl: string;
  title?: string;
}>();

const emit = defineEmits<{
  (_e: 'close'): void;
}>();

const { t } = useI18n();

const titleId = computed(() => 'magnet-title-' + Math.random().toString(36).slice(2, 9));
const descId = computed(() => 'magnet-desc-' + Math.random().toString(36).slice(2, 9));

const copyButtonLabel = ref(t('modals.magnetLink.copyLink'));

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(props.magnetUrl);
    copyButtonLabel.value = t('modals.magnetLink.copied');
    setTimeout(() => {
      copyButtonLabel.value = t('modals.magnetLink.copyLink');
    }, 2000);
  } catch {
    copyButtonLabel.value = t('modals.magnetLink.copyFailed');
  }
}

function openWithClient() {
  emit('close');
  if (typeof window !== 'undefined' && window.api?.openExternalUrl) {
    window.api.openExternalUrl(props.magnetUrl);
  }
}

const modalPanel = ref<HTMLElement | null>(null);
useModalFocusTrap(modalPanel, toRef(props, 'show'), () => emit('close'));
</script>

<style scoped>
.magnet-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  z-index: 9998;
}

.magnet-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90vw;
  max-width: 32rem;
  z-index: 9999;
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-2xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.magnet-header {
  padding: var(--spacing-lg) var(--spacing-lg) 0;
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.magnet-icon {
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--info-color-alpha-25);
  color: var(--primary-color);
}

.magnet-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.magnet-body {
  padding: 1.25rem var(--spacing-lg);
}

.magnet-file-name {
  margin: 0 0 0.5rem;
  font-size: var(--text-sm);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.magnet-url-field {
  width: 100%;
  box-sizing: border-box;
  padding: 0.75rem;
  font-family: var(--font-mono, monospace);
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  resize: none;
}

.magnet-actions {
  padding: 0 var(--spacing-lg) var(--spacing-lg);
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.magnet-btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
}

.magnet-btn-primary {
  background: var(--primary-color);
  color: var(--text-on-primary);
}

.magnet-btn-primary:hover {
  filter: brightness(1.1);
}

.magnet-btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-color);
}

.magnet-btn-secondary:hover {
  background: var(--bg-hover);
}
</style>
